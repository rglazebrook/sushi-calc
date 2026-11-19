import fishermen from "./data/fishermen.json" with { type: "json" };
import { roundingHalfWidth } from "./format.ts";

/**
 * Per-tier data lives in src/data/fishermen.json (null = not known yet):
 *   name       fisherman/fish name, entered from the game through T12
 *   fishValue  what one fish of that tier is worth
 *   estimated  true when fishValue is the curve's estimate (rounded like the
 *              game), not a value seen in game. Replace the value and delete
 *              this flag once you see the real one.
 */
interface TierRow {
  tier: number;
  name: string | null;
  fishValue: number | null;
  estimated?: boolean;
}
const rows = fishermen as TierRow[];
const names = new Map(rows.filter((f) => f.name).map((f) => [f.tier, f.name!]));
/** Values seen in game. Estimates are left out so the curve is fitted only to real readings. */
const knownValues = rows.filter((f) => !f.estimated && f.fishValue && f.fishValue > 0).map((f) => ({ tier: f.tier, value: f.fishValue! }));
/** The estimates written into fishermen.json, for checking they still match the curve. */
export const estimatedRows = rows.filter((f) => f.estimated && f.fishValue).map((f) => ({ tier: f.tier, value: f.fishValue! }));

/** Every fisherman catches one fish this often, whatever its tier (measured in game). */
export const CATCH_SECONDS = 6;

export function tierName(tier: number): string | undefined {
  return names.get(tier);
}

/** "T7 Octopus", or "T7" when the name isn't known. */
export function tierLabel(tier: number): string {
  const name = tierName(tier);
  return name ? `T${tier} ${name}` : `T${tier}`;
}

/**
 * What `count` hires become after automatic merging: the base-`mergeCount`
 * digits of the count, highest tier first, zero tiers left out.
 */
export function tierBreakdown(count: number, mergeCount = 3): { tier: number; count: number }[] {
  const out: { tier: number; count: number }[] = [];
  let rest = Math.max(0, Math.floor(count));
  for (let tier = 1; rest > 0; tier++) {
    const digit = rest % mergeCount;
    if (digit > 0) out.push({ tier, count: digit });
    rest = Math.floor(rest / mergeCount);
  }
  return out.reverse();
}

/**
 * Fish values from T4 up follow v = a·4^n + b·s^n (n = tier − 1): measured in
 * game, T4–T12 fit within 0.25% with a ≈ 0.864, b ≈ 2.20, s ≈ 2.50. The per-tier
 * multiplier dips to ~3.45 at T4→T5 and climbs toward 4. T1–T3 (1, 5, 24) are
 * hand-set and left out of the fit.
 */
export const CURVE_MIN_TIER = 4;

export interface FishCurve {
  a: number;
  b: number;
  s: number;
  value: (tier: number) => number;
}

/** Weighted least-squares fit of v = a·4^n + b·s^n, scanning s; needs 3+ known tiers from CURVE_MIN_TIER. */
export function fitFishCurve(known = knownValues): FishCurve | undefined {
  const pts = known.filter((p) => p.tier >= CURVE_MIN_TIER);
  if (pts.length < 3) return undefined;
  let best: { a: number; b: number; s: number; worst: number } | undefined;
  for (let s = 1.5; s < 3.99; s += 0.001) {
    let saa = 0, sab = 0, sbb = 0, sav = 0, sbv = 0;
    for (const { tier, value } of pts) {
      const h = roundingHalfWidth(value);
      const x = 4 ** (tier - 1) / h, y = s ** (tier - 1) / h, z = value / h;
      saa += x * x; sab += x * y; sbb += y * y; sav += x * z; sbv += y * z;
    }
    const det = saa * sbb - sab * sab;
    if (Math.abs(det) < 1e-300) continue;
    const a = (sav * sbb - sbv * sab) / det;
    const b = (saa * sbv - sab * sav) / det;
    const worst = Math.max(...pts.map((p) => Math.abs(a * 4 ** (p.tier - 1) + b * s ** (p.tier - 1) - p.value) / roundingHalfWidth(p.value)));
    if (!best || worst < best.worst) best = { a, b, s, worst };
  }
  if (!best) return undefined;
  const { a, b, s } = best;
  return { a, b, s, value: (tier) => a * 4 ** (tier - 1) + b * s ** (tier - 1) };
}

const fishCurve = fitFishCurve();

/** How many of the highest known tiers set the growth used above them. */
export const TOP_GROWTH_TIERS = 4;

export interface TopGrowth {
  /** Value per tier step above the top known tier (≈3.94 measured through T13). */
  ratio: number;
  scale: number;
  topTier: number;
  value: (tier: number) => number;
}

/**
 * Growth above the highest known tier: v = scale·ratio^tier, fitted to the top
 * TOP_GROWTH_TIERS known tiers (from CURVE_MIN_TIER), weighted by display rounding.
 * T9→T13 grow by a steady ×3.93–3.94 per tier; the a·4^n curve heads to ×4 and
 * overshot T13 (14.6M estimated vs 14.4M seen), so it isn't used to extrapolate.
 */
export function fitTopGrowth(known = knownValues): TopGrowth | undefined {
  const topTier = Math.max(...known.map((p) => p.tier));
  const pts = known.filter((p) => p.tier >= Math.max(CURVE_MIN_TIER, topTier - TOP_GROWTH_TIERS + 1));
  if (pts.length < 2) return undefined;
  let best: { ratio: number; scale: number; worst: number } | undefined;
  for (let ratio = 2; ratio <= 6; ratio += 0.0005) {
    let num = 0, den = 0;
    for (const { tier, value } of pts) {
      const h = roundingHalfWidth(value);
      const x = ratio ** tier / h;
      num += x * (value / h);
      den += x * x;
    }
    const scale = num / den;
    const worst = Math.max(...pts.map((p) => Math.abs(scale * ratio ** p.tier - p.value) / roundingHalfWidth(p.value)));
    if (!best || worst < best.worst) best = { ratio, scale, worst };
  }
  const { ratio, scale } = best!;
  return { ratio, scale, topTier, value: (tier) => scale * ratio ** tier };
}

const topGrowth = fitTopGrowth();

/**
 * Value of one fish of `tier`. Known values from fishermen.json are used as is.
 * Above the highest known tier, the growth of the top known tiers continues.
 * Missing tiers in between, from T4 up, come from the fitted curve; otherwise the
 * value grows by the same factor each tier between known neighbours.
 */
export function fishValue(
  tier: number,
  known = knownValues,
  curve = known === knownValues ? fishCurve : fitFishCurve(known),
  growth = known === knownValues ? topGrowth : fitTopGrowth(known),
): { value: number; estimated: boolean } | undefined {
  const pts = [...known].sort((a, b) => a.tier - b.tier);
  const exact = pts.find((p) => p.tier === tier);
  if (exact) return { value: exact.value, estimated: false };
  if (growth && tier > growth.topTier) return { value: growth.value(tier), estimated: true };
  if (curve && tier >= CURVE_MIN_TIER) return { value: curve.value(tier), estimated: true };
  if (pts.length < 2) return undefined;

  let lo = pts[0]!;
  let hi = pts[1]!;
  if (tier > pts.at(-1)!.tier) {
    lo = pts.at(-2)!;
    hi = pts.at(-1)!;
  } else if (tier > lo.tier) {
    const i = pts.findIndex((p) => p.tier > tier);
    lo = pts[i - 1]!;
    hi = pts[i]!;
  }
  const perTier = (hi.value / lo.value) ** (1 / (hi.tier - lo.tier));
  return { value: lo.value * perTier ** (tier - lo.tier), estimated: true };
}

export interface CatchRate {
  /** Fish caught per second by all fishermen. */
  fishPerSecond: number;
  /** Total value of those fish per second. */
  valuePerSecond: number;
  /** True when any tier's value was estimated rather than known. */
  estimated: boolean;
  byTier: { tier: number; fishermen: number; fishValue?: number; estimated: boolean; valuePerSecond: number }[];
}

/** Fish caught and their value per second, for `count` hires after merging. */
export function catchRate(count: number, known = knownValues): CatchRate {
  const byTier = tierBreakdown(count).map(({ tier, count: n }) => {
    const v = fishValue(tier, known);
    return { tier, fishermen: n, fishValue: v?.value, estimated: v?.estimated ?? true, valuePerSecond: ((v?.value ?? 0) * n) / CATCH_SECONDS };
  });
  return {
    fishPerSecond: byTier.reduce((s, t) => s + t.fishermen, 0) / CATCH_SECONDS,
    valuePerSecond: byTier.reduce((s, t) => s + t.valuePerSecond, 0),
    estimated: byTier.some((t) => t.estimated),
    byTier,
  };
}
