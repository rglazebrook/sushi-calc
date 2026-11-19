import chef from "./data/chef.json" with { type: "json" };
import { roundingHalfWidth } from "./format.ts";

/**
 * Chef upgrades. The chef's speed is in fish value per second (the same units
 * as what the fishermen catch). Measured in game, both the speed gain and the
 * cost of the next upgrade follow a power law of the current speed:
 *     gain ≈ a × speed^0.78      cost ≈ b × speed^1.19
 * Upgrade data lives in src/data/chef.json as "sessions": the speed shown before
 * and after a run of upgrades, and each upgrade's gain and cost as displayed.
 *   upgradesBefore  upgrades bought (but not written down) since the previous
 *                   session ended; links this session's speeds to that one's.
 *   next            the upgrade offered after the session (seen, not bought).
 */
export interface ChefSession {
  startSpeed: number;
  upgrades: ChefUpgrade[];
  endSpeed: number;
  upgradesBefore?: number;
  next?: ChefUpgrade;
}

export interface ChefModel {
  gainScale: number;
  gainExponent: number;
  costScale: number;
  costExponent: number;
  /**
   * Exact speed after the last recorded session: a known step on the game's
   * upgrade ladder, used to snap speeds read in game. Not any player's current speed.
   */
  lastSpeed: number;
}

export interface ChefUpgrade {
  gain: number;
  cost: number;
}

const range = (shown: number) => [shown - roundingHalfWidth(shown), shown + roundingHalfWidth(shown)] as const;
const totalGain = (s: ChefSession) => s.upgrades.reduce((sum, u) => sum + u.gain, 0);

/**
 * The game rounds the speeds it shows, so the exact speed before a session's
 * first upgrade is pinned down by both ends: start shown as 1.8M means
 * 1.75–1.85M, and end = start + gains must also round to the shown end speed.
 */
export function sessionStartSpeed(s: ChefSession): number {
  const total = totalGain(s);
  const [sLo, sHi] = range(s.startSpeed);
  const [eLo, eHi] = range(s.endSpeed);
  const lo = Math.max(sLo, eLo - total);
  const hi = Math.min(sHi, eHi - total);
  return lo <= hi ? (lo + hi) / 2 : (s.startSpeed + s.endSpeed - total) / 2;
}

function powerFit(xs: number[], ys: number[]): { scale: number; exponent: number } {
  const X = xs.map(Math.log);
  const Y = ys.map(Math.log);
  const mx = X.reduce((a, b) => a + b, 0) / X.length;
  const my = Y.reduce((a, b) => a + b, 0) / Y.length;
  let sxy = 0;
  let sxx = 0;
  X.forEach((x, i) => {
    sxy += (x - mx) * (Y[i]! - my);
    sxx += (x - mx) ** 2;
  });
  const exponent = sxy / sxx;
  return { scale: Math.exp(my - exponent * mx), exponent };
}

/** Sessions linked by `upgradesBefore` form one chain of known speeds. */
function chains(sessions: ChefSession[]): ChefSession[][] {
  const out: ChefSession[][] = [];
  for (const s of sessions) {
    if (s.upgradesBefore !== undefined && out.length) out.at(-1)!.push(s);
    else out.push([s]);
  }
  return out;
}

/**
 * Speeds before each upgrade in a chain, given the first session's start and a
 * guess for each unrecorded upgrade's gain. Also returns each display (shown
 * speed and its exact value) for checking against the game's rounding.
 */
function walk(chain: ChefSession[], start: number, gapGain: (speed: number) => number) {
  const points: { speed: number; u: ChefUpgrade }[] = [];
  const displays: { shown: number; speed: number }[] = [];
  let speed = start;
  chain.forEach((s, i) => {
    if (i > 0) for (let k = 0; k < (s.upgradesBefore ?? 0); k++) speed += gapGain(speed);
    displays.push({ shown: s.startSpeed, speed });
    for (const u of s.upgrades) {
      points.push({ speed, u });
      speed += u.gain;
    }
    displays.push({ shown: s.endSpeed, speed });
    if (s.next) points.push({ speed, u: s.next });
  });
  return { points, displays, end: speed };
}

/**
 * The first session's exact start speed for a chain. Displays are honoured
 * newest first (the newest is what the player sees now); one that can't be
 * met together with the newer ones is skipped, since a few gains rounded down
 * in game can shift the chain by ~0.5%.
 */
function chainStart(chain: ChefSession[], gapGain: (speed: number) => number): number {
  if (chain.length === 1) return sessionStartSpeed(chain[0]!);
  // Offsets of each display from the start, walked from the shown start (unrecorded gains barely depend on the exact start).
  const guess = sessionStartSpeed(chain[0]!);
  const base = walk(chain, guess, gapGain).displays;
  let lo = -Infinity;
  let hi = Infinity;
  for (const d of [...base].reverse()) {
    const [rLo, rHi] = range(d.shown);
    const offset = d.speed - guess;
    const nLo = Math.max(lo, rLo - offset);
    const nHi = Math.min(hi, rHi - offset);
    if (nLo <= nHi) [lo, hi] = [nLo, nHi];
  }
  return (lo + hi) / 2;
}

export function fitChef(sessions: ChefSession[] = (chef as { sessions: ChefSession[] }).sessions): ChefModel | undefined {
  // Unrecorded upgrades are first guessed from the recorded gains, then from the fit (a few rounds settle it).
  const all = sessions.flatMap((s) => s.upgrades);
  if (!all.length) return undefined;
  let gapGain = (_speed: number) => all.reduce((a, u) => a + u.gain, 0) / all.length;
  let model: ChefModel | undefined;
  for (let round = 0; round < 4; round++) {
    const points: { speed: number; u: ChefUpgrade }[] = [];
    let lastSpeed = 0;
    for (const chain of chains(sessions)) {
      const w = walk(chain, chainStart(chain, gapGain), gapGain);
      points.push(...w.points);
      lastSpeed = w.end;
    }
    if (new Set(points.map((p) => p.speed)).size < 2) return undefined;
    const g = powerFit(points.map((p) => p.speed), points.map((p) => p.u.gain));
    const c = powerFit(points.map((p) => p.speed), points.map((p) => p.u.cost));
    model = { gainScale: g.scale, gainExponent: g.exponent, costScale: c.scale, costExponent: c.exponent, lastSpeed };
    const m = model;
    gapGain = (speed) => m.gainScale * speed ** m.gainExponent;
  }
  return model;
}

export const chefModel = fitChef();

/** The next upgrade at `speed`. */
export function nextUpgrade(model: ChefModel, speed: number): ChefUpgrade {
  return { gain: model.gainScale * speed ** model.gainExponent, cost: model.costScale * speed ** model.costExponent };
}

/** Upgrades (and their total cost) needed to bring the chef from `speed` up to `target`. */
export function upgradesToReach(model: ChefModel, speed: number, target: number, max = 10_000): { upgrades: number; cost: number; speed: number } {
  let n = 0;
  let cost = 0;
  while (speed < target && n < max) {
    const u = nextUpgrade(model, speed);
    speed += u.gain;
    cost += u.cost;
    n++;
  }
  return { upgrades: n, cost, speed };
}

/** Speed after `n` more upgrades from `speed`. */
export function speedAfter(model: ChefModel, n: number, speed = model.lastSpeed): number {
  for (let i = 0; i < n; i++) speed += nextUpgrade(model, speed).gain;
  return speed;
}

/**
 * Steps up the upgrade ladder from the last session in chef.json that best explain
 * a speed read in game (nearest step; 0 at or below that speed).
 */
export function upgradesFromSpeed(model: ChefModel, target: number, max = 100_000): number {
  let speed = model.lastSpeed;
  let n = 0;
  while (n < max) {
    const gain = nextUpgrade(model, speed).gain;
    if (speed + gain / 2 > target) return n;
    speed += gain;
    n++;
  }
  return n;
}

/**
 * The player's chef speed: a speed typed in from the game, or else their step on
 * the upgrade ladder (exact, unlike the game's rounded display). Undefined until
 * the player has entered one; there is no default, since every player's chef differs.
 */
export function chefSpeedNow(model: ChefModel | undefined, typed: number | undefined, ladderStep: number | undefined): number | undefined {
  if (typed !== undefined) return typed;
  return model && ladderStep !== undefined ? speedAfter(model, ladderStep) : undefined;
}
