import boats from "./data/boats.json" with { type: "json" };

/** A boat rarity and its prize odds. Edit src/data/boats.json to add one. */
export interface BoatType {
  name: string;
  /** Chance in percent (0-100) of each prize tier. */
  outcomes: { tier: number; chance: number }[];
  /**
   * Costs seen in game at a fisherman count. Boats cost a fixed multiple of the
   * Hire 1 price for every player, so these give everyone costs from their count
   * alone; a player's own readings replace them.
   */
  costReadings?: { count: number; cost: number }[];
}

export const boatTypes: BoatType[] = boats;

/** Seconds of saving to afford `cost`, starting from `cash`; 0 when already affordable. */
export function saveTime(cost: number, rate: number, cash = 0): number {
  const short = cost - cash;
  if (short <= 0) return 0;
  return rate > 0 ? short / rate : Infinity;
}
