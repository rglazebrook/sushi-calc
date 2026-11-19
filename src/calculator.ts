import { costOfHires, fitCurve, hiresAffordable } from "./pricing.ts";
import type { FishFlow, GameConfig, IncomeReport, PlayerState, Roster } from "./types.ts";

export function priceMultiplier(state: PlayerState): number {
  return (state.boosts.greeter ? 1.5 : 1) * (state.boosts.doubleMoney ? 2 : 1);
}

export function fishPerCatch(state: PlayerState): number {
  return state.boosts.manager ? 2 : 1;
}

export function chefSpeedMultiplier(state: PlayerState): number {
  return (state.boosts.sousChef ? 2 : 1) * state.kitchenSpeedMultiplier;
}

/** How many T1 hires one fisherman of `tier` is worth (3^(tier-1) with 3-to-1 merges). */
export function hireEquivalent(tier: number, mergeCount: number): number {
  return mergeCount ** (tier - 1);
}

/** Add fishermen at a tier and apply automatic merges. Returns a new roster. */
export function addFishermen(roster: Roster, tier: number, count: number, mergeCount: number): Roster {
  const out: Roster = { ...roster };
  out[tier] = (out[tier] ?? 0) + count;
  for (let t = tier; (out[t] ?? 0) >= mergeCount; t++) {
    const merged = Math.floor(out[t]! / mergeCount);
    out[t] = out[t]! % mergeCount;
    out[t + 1] = (out[t + 1] ?? 0) + merged;
  }
  return out;
}

/** Total roster value in T1-hire equivalents. */
export function rosterHireEquivalents(roster: Roster, mergeCount: number): number {
  return Object.entries(roster).reduce((s, [t, n]) => s + n * hireEquivalent(Number(t), mergeCount), 0);
}

/**
 * Steady-state income. Fish flow from fishermen into one chef. If the chef is
 * the bottleneck, it cooks from the mixed pile in arrival order, so each tier's
 * fish is cooked in proportion to its supply.
 */
export function computeIncome(config: GameConfig, state: PlayerState): IncomeReport {
  const priceMult = priceMultiplier(state);
  const perCatch = fishPerCatch(state);

  const flows: FishFlow[] = [];
  for (const [tierKey, fishermen] of Object.entries(state.fishermen)) {
    if (fishermen <= 0) continue;
    const fish = config.fish.find((f) => f.tier === Number(tierKey));
    if (!fish) throw new Error(`No fish data for tier ${tierKey}; add it to data.ts`);
    flows.push({
      fish,
      fishermen,
      fishPerSecond: (fishermen * perCatch) / fish.catchSeconds,
      pricePerSushi: fish.sushiPrice * priceMult,
    });
  }
  flows.sort((a, b) => a.fish.tier - b.fish.tier);

  const supplyPerSecond = sum(flows.map((f) => f.fishPerSecond));
  const chefCapacityPerSecond = chefSpeedMultiplier(state) / config.chefSecondsPerSushi;
  const sushiPerSecond = Math.min(supplyPerSecond, chefCapacityPerSecond);

  const supplyValue = sum(flows.map((f) => f.fishPerSecond * f.pricePerSushi));
  const cookedFraction = supplyPerSecond > 0 ? sushiPerSecond / supplyPerSecond : 0;
  const cashPerSecond = supplyValue * cookedFraction;

  const ratio = chefCapacityPerSecond > 0 ? supplyPerSecond / chefCapacityPerSecond : Infinity;
  const bottleneck = Math.abs(ratio - 1) < 0.02 ? "balanced" : ratio < 1 ? "fishermen" : "chef";

  return {
    flows,
    supplyPerSecond,
    chefCapacityPerSecond,
    sushiPerSecond,
    bottleneck,
    chefUtilization: chefCapacityPerSecond > 0 ? sushiPerSecond / chefCapacityPerSecond : 0,
    cashPerSecond,
    cashPerHour: cashPerSecond * 3600,
  };
}

export interface HireOption {
  count: number;
  cost: number;
  /** Change in cash per second after hiring and merging. */
  deltaCashPerSecond: number;
  /** Seconds of extra income to earn back the cost. */
  paybackSeconds: number;
  /** Seconds to save up for it at current income. */
  waitSeconds: number;
  after: Roster;
}

/** Evaluate each hire pad (1/5/25/100). */
export function evaluateHirePads(config: GameConfig, state: PlayerState): HireOption[] {
  const curve = fitCurve(state.padPrices);
  const before = computeIncome(config, state);
  return config.hirePadSizes.map((count) => {
    const cost = state.padPrices[count] ?? costOfHires(curve, count);
    const after = addFishermen(state.fishermen, 1, count, config.mergeCount);
    const delta = computeIncome(config, { ...state, fishermen: after }).cashPerSecond - before.cashPerSecond;
    return {
      count,
      cost,
      deltaCashPerSecond: delta,
      paybackSeconds: delta > 0 ? cost / delta : Infinity,
      waitSeconds: secondsToAfford(cost, state.cash, before.cashPerSecond),
      after,
    };
  });
}

/** Seconds of income needed to afford `cost`. 0 if already affordable. */
export function secondsToAfford(cost: number, cash: number, cashPerSecond: number): number {
  if (cash >= cost) return 0;
  if (cashPerSecond <= 0) return Infinity;
  return (cost - cash) / cashPerSecond;
}

/** Fishermen you could hire right now with your cash. */
export function affordableHires(state: PlayerState): number {
  return hiresAffordable(fitCurve(state.padPrices), state.cash);
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
