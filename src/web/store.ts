import { useEffect, useState } from "react";

export interface Observation {
  id: string;
  /** Total fishermen when the prices were read; undefined until entered. */
  count?: number;
  hire1?: number;
  /** Hire 100 pad price at the same moment (optional). */
  hire100?: number;
}

export interface BoatReading {
  id: string;
  /** Total fishermen when the cost was read. */
  count?: number;
  cost?: number;
}

/**
 * What the browser saves. Boat names and odds live in src/data/boats.json;
 * only the cost readings each boat has collected are saved here, by boat name.
 */
export interface AppState {
  /** Total fishermen right now. */
  count?: number;
  observations: Observation[];
  boatReadings: Record<string, BoatReading[]>;
  /** Chef speed in fish value per second; undefined = the estimate from chef.json. */
  chefSpeed?: number;
  /**
   * The player's step on the chef upgrade ladder, counted from the last session in
   * chef.json. Set when they enter a speed; each Upgrade click adds one.
   */
  chefUpgrades?: number;
  /** Permanent money multiplier bought with Robux; applies when collecting, not to amounts shown in game. */
  moneyMultiplier?: number;
  /** Fish waiting with the chef, as entered at time `at` (ms since epoch); it drains at chef speed from then. */
  chefBacklog?: { fish: number; at: number };
}

export const newId = () => Math.random().toString(36).slice(2, 10);

export const defaultState: AppState = {
  count: undefined,
  observations: [],
  boatReadings: {},
};

/** Saves from older versions of the app. */
interface LegacyState {
  count?: number;
  chefSpeed?: number;
  chefUpgrades?: number;
  moneyMultiplier?: number;
  chefBacklog?: { fish: number; at: number };
  observations?: Observation[];
  boatReadings?: Record<string, BoatReading[]>;
  /** Before boats.json: each boat stored its name, odds, and readings (or one `cost`). */
  boats?: { name: string; readings?: BoatReading[]; cost?: number }[];
}

/** Bring any older save up to the current shape, keeping every reading. */
export function migrate(raw: LegacyState): AppState {
  const boatReadings: Record<string, BoatReading[]> = { ...raw.boatReadings };
  for (const b of raw.boats ?? []) {
    const readings = b.readings ?? (b.cost ? [{ id: newId(), count: raw.count, cost: b.cost }] : []);
    boatReadings[b.name] = [...(boatReadings[b.name] ?? []), ...readings];
  }
  return {
    count: raw.count,
    observations: raw.observations ?? defaultState.observations,
    boatReadings,
    chefSpeed: raw.chefSpeed,
    chefUpgrades: raw.chefUpgrades,
    moneyMultiplier: raw.moneyMultiplier,
    chefBacklog: raw.chefBacklog,
  };
}

const KEY = "sushi-calc-v1";

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw) as LegacyState);
  } catch {
    // Storage unavailable or corrupt: start fresh.
  }
  return defaultState;
}

/** App state saved in this browser. */
export function useAppState() {
  const [state, setState] = useState<AppState>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Ignore: the calculator still works without saving.
    }
  }, [state]);
  return [state, setState] as const;
}

const UI_KEY = "sushi-calc-ui-v1";

/** View preferences (like which boat cards are collapsed), kept apart from the readings so Reset leaves them alone. */
export function useCollapsed(group: string) {
  const read = (): string[] => {
    try {
      const all = JSON.parse(localStorage.getItem(UI_KEY) ?? "{}") as Record<string, unknown>;
      const v = all[group];
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  };
  const [collapsed, setCollapsed] = useState<string[]>(read);
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem(UI_KEY) ?? "{}") as Record<string, unknown>;
      localStorage.setItem(UI_KEY, JSON.stringify({ ...all, [group]: collapsed }));
    } catch {
      // Ignore: collapse state just won't survive a refresh.
    }
  }, [group, collapsed]);
  const toggle = (name: string) => setCollapsed((c) => (c.includes(name) ? c.filter((x) => x !== name) : [...c, name]));
  return [new Set(collapsed), toggle] as const;
}
