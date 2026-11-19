/**
 * Hire prices.
 *
 * Measured in game (5 readings, 44K to 300K fishermen): the Hire 1 price follows
 * a power law of the fishermen count,
 *     price(count) ≈ 2.202 × count^0.869
 * within 0.05% (about the game's display rounding). PriceModel fits that form
 * from the player's readings. The older geometric curve (fitted from pad prices
 * alone) is kept for the command-line tools.
 */

/** Hire prices starting from the player's current position. */
export interface PriceCurve {
  /** Price of the very next single hire. */
  next: number;
  /** How much the next hire raises the price of the one after it. */
  nextIncrease: number;
  /** Total cost of the next `n` hires. */
  costOf: (n: number) => number;
  /** True when only one price was known, so a flat price was assumed. */
  assumedFlat: boolean;
  /** Per-hire multiplier, for geometric curves only. */
  growth?: number;
}

/** Total cost of the next `n` hires. */
export function costOfHires(curve: PriceCurve, n: number): number {
  return n <= 0 ? 0 : curve.costOf(n);
}

/** Most hires `cash` can buy, one at a time. */
export function hiresAffordable(curve: PriceCurve, cash: number): number {
  let lo = 0;
  let hi = 1;
  while (costOfHires(curve, hi) <= cash && hi < 1e12) hi *= 2;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (costOfHires(curve, mid) <= cash) lo = mid;
    else hi = mid;
  }
  return lo;
}

// ---------------------------------------------------------------- power law

/** price(count) = scale × count^exponent */
export interface PriceModel {
  scale: number;
  exponent: number;
  /**
   * "observations": fitted from 2+ of the player's readings; "default": one reading plus the
   * measured exponent; "builtin": no readings in the browser, so the formula fitted from the
   * readings saved in src/data/hiring.json.
   */
  source: "observations" | "default" | "builtin";
  /** Largest relative error against the readings (0 = perfect fit). */
  maxError: number;
}

export interface PriceObservation {
  count: number;
  price: number;
}

/** Exponent measured from in-game readings; used when only one reading exists. */
export const DEFAULT_EXPONENT = 0.869;

export function priceAt(model: PriceModel, count: number): number {
  return model.scale * Math.max(count, 1) ** model.exponent;
}

/** Hire curve starting at `count` fishermen. */
export function curveAt(model: PriceModel, count: number): PriceCurve {
  const { scale, exponent: b } = model;
  const n0 = Math.max(count, 1);
  return {
    next: priceAt(model, n0),
    nextIncrease: priceAt(model, n0 + 1) - priceAt(model, n0),
    // Sum of price(n0 + i) for i < n, via the midpoint integral (exact to well under 0.01% here).
    costOf: (n) => {
      if (n <= 20) {
        let total = 0;
        for (let i = 0; i < n; i++) total += priceAt(model, n0 + i);
        return total;
      }
      const lo = n0 - 0.5;
      const hi = n0 + n - 0.5;
      return (scale / (b + 1)) * (hi ** (b + 1) - lo ** (b + 1));
    },
    assumedFlat: false,
  };
}

/**
 * Fit price = scale × count^exponent. Two or more readings at different counts:
 * least squares on log(price) vs log(count). One reading: use DEFAULT_EXPONENT.
 */
export function fitModel(observations: PriceObservation[]): PriceModel | undefined {
  const obs = observations.filter((o) => o.price > 0 && o.count >= 1);
  if (obs.length === 0) return undefined;

  if (new Set(obs.map((o) => o.count)).size < 2) {
    const o = obs.at(-1)!;
    return { scale: o.price / o.count ** DEFAULT_EXPONENT, exponent: DEFAULT_EXPONENT, source: "default", maxError: 0 };
  }

  const xs = obs.map((o) => Math.log(o.count));
  const ys = obs.map((o) => Math.log(o.price));
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i]! - my);
    sxx += (x - mx) ** 2;
  });
  const exponent = sxy / sxx;
  const model: PriceModel = { scale: Math.exp(my - exponent * mx), exponent, source: "observations", maxError: 0 };
  model.maxError = Math.max(...obs.map((o) => Math.abs(priceAt(model, o.count) / o.price - 1)));
  return model;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// ------------------------------------------------- geometric (pad prices only)

/** Sum of growth^k for k = 0..n-1. */
function geometricSum(n: number, growth: number): number {
  if (Math.abs(growth - 1) < 1e-12) return n;
  return (growth ** n - 1) / (growth - 1);
}

/** Curve where each hire multiplies the next price by `growth`. */
export function geometricCurve(next: number, growth: number, assumedFlat = false): PriceCurve {
  return { next, growth, nextIncrease: next * (growth - 1), costOf: (n) => next * geometricSum(n, growth), assumedFlat };
}

/** Geometric curve whose `padSize` pad costs `padPrice`. */
export function curveFromPad(padSize: number, padPrice: number, growth: number): PriceCurve {
  return geometricCurve(padPrice / geometricSum(padSize, growth), growth);
}

/** Fit a geometric curve to pad prices shown at one moment, e.g. { 1: 23800, 100: 2400000 }. */
export function fitCurve(padPrices: Record<number, number>): PriceCurve {
  const pads = Object.entries(padPrices)
    .map(([size, price]) => ({ size: Number(size), price }))
    .filter((p) => p.size > 0 && p.price > 0)
    .sort((a, b) => a.size - b.size);
  if (pads.length === 0) throw new Error("Need at least one hire pad price");

  const small = pads[0]!;
  const large = pads[pads.length - 1]!;
  if (pads.length === 1) return geometricCurve(small.price / small.size, 1, true);

  const target = large.price / small.price;
  const ratio = (g: number) => geometricSum(large.size, g) / geometricSum(small.size, g);
  if (target <= ratio(1)) return curveFromPad(small.size, small.price, 1);

  let lo = 1;
  let hi = 2;
  while (ratio(hi) < target) hi = 1 + (hi - 1) * 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (ratio(mid) < target) lo = mid;
    else hi = mid;
  }
  return curveFromPad(small.size, small.price, (lo + hi) / 2);
}

// ---------------------------------------------------------------- boat costs

/**
 * Measured in game (4 boats, 9 readings): a boat's cost is a fixed multiple of
 * the Hire 1 price at the same fisherman count, e.g. Rare = 853.4 and 853.3
 * Hire 1 prices at 497K and 518K fishermen. So boat cost = multiplier × price(count).
 */
export interface BoatFit {
  multiplier: number;
  /** Per input reading: cost ÷ (multiplier × Hire 1 price) − 1; undefined for unusable readings. */
  deviations: (number | undefined)[];
  /** Per input reading: true when left out as an outlier (likely an outdated cost). */
  ignored: boolean[];
}

/**
 * Fit one boat's multiplier. The reading at the highest count anchors it;
 * readings more than `tolerance` away from the anchor are treated as outdated
 * and ignored; the rest are averaged (geometric mean).
 */
export function fitBoatMultiplier(
  readings: { count?: number; cost?: number }[],
  model: PriceModel,
  tolerance = 0.03,
): BoatFit | undefined {
  const ratios = readings.map((r) => (r.count !== undefined && r.count >= 1 && r.cost && r.cost > 0 ? r.cost / priceAt(model, r.count) : undefined));
  let anchor = -1;
  readings.forEach((r, i) => {
    if (ratios[i] !== undefined && (anchor < 0 || r.count! >= readings[anchor]!.count!)) anchor = i;
  });
  if (anchor < 0) return undefined;

  const ignored = ratios.map((x) => x !== undefined && Math.abs(x / ratios[anchor]! - 1) > tolerance);
  const kept = ratios.filter((x, i): x is number => x !== undefined && !ignored[i]);
  const multiplier = Math.exp(mean(kept.map(Math.log)));
  return { multiplier, deviations: ratios.map((x) => (x === undefined ? undefined : x / multiplier - 1)), ignored };
}
