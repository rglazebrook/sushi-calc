/** A fisherman tier and the fish it catches. */
export interface Fish {
  tier: number;
  name: string;
  /** Cash a customer pays for one sushi made from this fish, before multipliers. */
  sushiPrice: number;
  /** Seconds a fisherman of this tier takes to catch one batch. */
  catchSeconds: number;
  /** True when the numbers were measured in-game; false for placeholders. */
  verified: boolean;
}

/** One-time Robux employees/passes that act as multipliers. */
export interface Boosts {
  /** Sous Chef: doubles chef skill (cooking speed). */
  sousChef: boolean;
  /** Greeter: customers pay 1.5x. */
  greeter: boolean;
  /** Manager: twice as many fish per catch. */
  manager: boolean;
  /** 2x Money gamepass. */
  doubleMoney: boolean;
}

export interface GameConfig {
  /** One entry per tier. */
  fish: Fish[];
  /** Seconds the chef needs per sushi at base skill. */
  chefSecondsPerSushi: number;
  /** Fishermen of one tier that automatically merge into one of the next. */
  mergeCount: number;
  /** Bulk-hire pad sizes available in game. */
  hirePadSizes: number[];
}

/** Fishermen owned, keyed by tier. */
export type Roster = Record<number, number>;

export interface PlayerState {
  fishermen: Roster;
  cash: number;
  /**
   * Prices currently shown on the hire pads, keyed by pad size,
   * e.g. { "1": 12000, "100": 1000000 }. Any subset works; more pads give a
   * better estimate of how fast the price rises.
   */
  padPrices: Record<number, number>;
  boosts: Boosts;
  /** Extra multiplier on chef speed from kitchen upgrades (1 = none). */
  kitchenSpeedMultiplier: number;
}

export interface FishFlow {
  fish: Fish;
  fishermen: number;
  /** Fish caught per second by all fishermen of this tier. */
  fishPerSecond: number;
  /** Cash per sushi after price multipliers. */
  pricePerSushi: number;
}

export interface IncomeReport {
  flows: FishFlow[];
  supplyPerSecond: number;
  chefCapacityPerSecond: number;
  sushiPerSecond: number;
  bottleneck: "fishermen" | "chef" | "balanced";
  chefUtilization: number;
  cashPerSecond: number;
  cashPerHour: number;
}
