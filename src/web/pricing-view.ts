import hiring from "../data/hiring.json" with { type: "json" };
import { curveAt, fitCurve, fitModel, type PriceCurve, type PriceModel } from "../pricing.ts";
import type { AppState, Observation } from "./store.ts";

export interface PricingView {
  curve?: PriceCurve;
  model?: PriceModel;
  /** Fisherman count prices are shown for. */
  count?: number;
  /** Readings that have both a count and a Hire 1 price. */
  usable: Observation[];
}

/** The formula fitted from the readings saved in src/data/hiring.json, used when the browser has none. */
export const builtinModel: PriceModel | undefined = (() => {
  const m = fitModel(hiring.readings.map((r) => ({ count: r.count, price: r.hire1 })));
  return m && { ...m, source: "builtin" };
})();

/** Turn the saved price readings into a hire price curve for the current count. */
export function derivePricing(state: AppState): PricingView {
  const priced = state.observations.filter((o) => o.hire1 && o.hire1 > 0);
  const usable = priced.filter((o) => o.count !== undefined && o.count >= 1);
  const latest = usable.length ? usable.reduce((a, b) => (b.count! >= a.count! ? b : a)) : priced.at(-1);
  const count = state.count ?? latest?.count;

  const own = fitModel(usable.map((o) => ({ count: o.count!, price: o.hire1! })));
  // No usable readings of the player's own: use the saved game formula. Prices need the player's own count.
  const model = own ?? builtinModel;
  if (model && count !== undefined) return { curve: curveAt(model, count), model, count, usable };
  if (model && !latest?.hire1) return { model, count, usable };

  // No count yet: fall back to the latest reading's pad prices.
  if (latest?.hire1) {
    const pads: Record<number, number> = { 1: latest.hire1 };
    if (latest.hire100) pads[100] = latest.hire100;
    return { curve: fitCurve(pads), count, usable };
  }
  return { count, usable };
}
