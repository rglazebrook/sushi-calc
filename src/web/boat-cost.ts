import type { BoatType } from "../boats.ts";
import { fitBoatMultiplier, priceAt, type BoatFit, type PriceModel } from "../pricing.ts";
import type { BoatReading } from "./store.ts";

/**
 * Each boat costs a fixed multiple of the Hire 1 price, fitted from the player's
 * readings, or else from the readings saved with the boat in boats.json.
 */
export function boatCost(
  readings: BoatReading[],
  count: number | undefined,
  model?: PriceModel,
  saved?: BoatType["costReadings"],
): { fit?: BoatFit; cost?: number; fromSaved?: boolean } {
  const own = model ? fitBoatMultiplier(readings, model) : undefined;
  const fit = own ?? (model && saved?.length ? fitBoatMultiplier(saved, model) : undefined);
  const fromSaved = !own && !!fit;
  if (fit && model && count !== undefined) return { fit, cost: fit.multiplier * priceAt(model, count), fromSaved };
  return { fit, cost: readings.filter((r) => r.cost).at(-1)?.cost, fromSaved }; // no hire formula or no count yet: latest cost as entered
}
