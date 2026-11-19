import { tierName } from "./tiers.ts";
import type { Fish, GameConfig } from "./types.ts";

/**
 * Game data. Confirmed:
 *   - Every 3 fishermen of a tier automatically merge into 1 of the next tier.
 *   - Hire pads sell 1, 5, 25 or 100 fishermen; each hire raises the next price.
 *   - 24 fish species; the first three are Sardine, Mackerel, Trout.
 *
 * Entries marked `verified: false` (prices, catch times, chef speed) are
 * PLACEHOLDERS. Measure them in-game and edit them here. The gamble
 * calculator does not depend on them.
 */
const knownFish: Fish[] = [
  { tier: 1, name: "Sardine", sushiPrice: 5, catchSeconds: 5, verified: false },
  { tier: 2, name: "Mackerel", sushiPrice: 18, catchSeconds: 5, verified: false },
  { tier: 3, name: "Trout", sushiPrice: 60, catchSeconds: 5, verified: false },
];

/** Placeholder tiers up to 24 (3.5x price per tier) until real numbers are filled in. */
const placeholderFish: Fish[] = Array.from({ length: 24 - knownFish.length }, (_, i) => {
  const tier = knownFish.length + 1 + i;
  return { tier, name: tierName(tier) ?? `Tier ${tier} fish`, sushiPrice: Math.round(60 * 3.5 ** (tier - 3)), catchSeconds: 5, verified: false };
});

export const defaultConfig: GameConfig = {
  chefSecondsPerSushi: 1.5, // placeholder
  mergeCount: 3,
  hirePadSizes: [1, 5, 25, 100],
  fish: [...knownFish, ...placeholderFish],
};
