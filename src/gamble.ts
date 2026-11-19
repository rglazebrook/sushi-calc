import { hireEquivalent } from "./calculator.ts";
import { costOfHires, curveFromPad, hiresAffordable, type PriceCurve } from "./pricing.ts";

/**
 * Boat gamble valuation.
 *
 * Merges are automatic 3-to-1, so owning one T(n) fisherman is identical to
 * having hired 3^(n-1) T1 fishermen (adding in base 3 carries the same way).
 * A gamble prize is therefore worth exactly what those hires would cost you at
 * today's rising prices. Prizes raise hire prices like the equivalent hires
 * would, so winning a prize and hiring its equivalent end in the same state.
 */
export interface Gamble {
  cost: number;
  outcomes: { tier: number; chance: number }[];
}

export interface OutcomeValue {
  tier: number;
  chance: number;
  /** T1 hires this prize equals. */
  hires: number;
  /** What those hires would cost at current prices. */
  hireCost: number;
}

export interface GambleReport {
  outcomes: OutcomeValue[];
  /** Sum of chances; below 1 means some outcomes give nothing. */
  totalChance: number;
  expectedHires: number;
  /** Average value of the prize in hire cost. */
  expectedValue: number;
  /** expectedValue - cost. */
  expectedProfit: number;
  /** expectedValue / cost; above 1 is a good bet on average. */
  valuePerDollar: number;
  /** Chance the prize is worth more than you paid. */
  chanceOfProfit: number;
  /** Fishermen the same cash buys at the pads instead. */
  hiresForSameCash: number;
  worthIt: boolean;
}

export function evaluateGamble(gamble: Gamble, curve: PriceCurve, mergeCount = 3): GambleReport {
  const outcomes = gamble.outcomes.map(({ tier, chance }) => {
    const hires = hireEquivalent(tier, mergeCount);
    return { tier, chance, hires, hireCost: costOfHires(curve, hires) };
  });
  const totalChance = outcomes.reduce((s, o) => s + o.chance, 0);
  const expectedHires = outcomes.reduce((s, o) => s + o.chance * o.hires, 0);
  const expectedValue = outcomes.reduce((s, o) => s + o.chance * o.hireCost, 0);
  return {
    outcomes,
    totalChance,
    expectedHires,
    expectedValue,
    expectedProfit: expectedValue - gamble.cost,
    valuePerDollar: expectedValue / gamble.cost,
    chanceOfProfit: outcomes.filter((o) => o.hireCost > gamble.cost).reduce((s, o) => s + o.chance, 0),
    hiresForSameCash: hiresAffordable(curve, gamble.cost),
    worthIt: expectedValue > gamble.cost,
  };
}

/**
 * When only one pad price is known, the price growth is unknown. Scan growth
 * rates (keeping that pad's price fixed) and return the lowest one at which
 * the gamble breaks even, or undefined if none up to `maxGrowth`.
 */
export function breakevenGrowth(
  gamble: Gamble,
  padSize: number,
  padPrice: number,
  mergeCount = 3,
  maxGrowth = 1.2,
): number | undefined {
  const worth = (g: number) => evaluateGamble(gamble, curveFromPad(padSize, padPrice, g), mergeCount).worthIt;
  if (worth(1)) return 1;
  const step = 0.0005;
  for (let g = 1 + step; g <= maxGrowth; g += step) {
    if (worth(g)) {
      let lo = g - step;
      let hi = g;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (worth(mid)) hi = mid;
        else lo = mid;
      }
      return hi;
    }
  }
  return undefined;
}
