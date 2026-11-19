/**
 * The Fish Value modifier (usually ×0.5–×1.5, changing every 30 s) scales fish
 * when they're handed to the chef: delivering 100M at ×1.5 gives the chef 150M.
 *
 * Fish can be held and delivered later, so what matters is the modifier you
 * deliver at. If everything you catch is delivered at ×m, the chef receives
 * m × catch per second and income is min(chef speed, m × catch).
 *
 * Break-even = chef speed ÷ catch: at that modifier your catch exactly fills
 * the chef. Delivering at or above it keeps the chef fully busy; below it the
 * chef has spare time, so each fish is worth more if held for a better modifier.
 * Assumes held fish don't spoil and the chef can queue a large delivery.
 */

/** Modifier at which delivering your whole catch exactly fills the chef. */
export function breakEvenModifier(catchValue: number, chefSpeed: number): number {
  return catchValue > 0 ? chefSpeed / catchValue : Infinity;
}

/** Income per second if every fish is delivered at modifier `m`. */
export function incomeAtModifier(m: number, catchValue: number, chefSpeed: number): number {
  return Math.min(chefSpeed, m * catchValue);
}

export interface DeliveryAdvice {
  deliver: boolean;
  /** What the chef receives for `held` fish at this modifier. */
  chefReceives: number;
  /** Seconds the chef needs to process that delivery. */
  chefBusySeconds: number;
  breakEven: number;
}

/** Should fish be delivered now, at modifier `m`? */
export function deliveryAdvice(m: number, held: number, catchValue: number, chefSpeed: number): DeliveryAdvice {
  const breakEven = breakEvenModifier(catchValue, chefSpeed);
  const chefReceives = m * held;
  return { deliver: m >= breakEven, chefReceives, chefBusySeconds: chefSpeed > 0 ? chefReceives / chefSpeed : Infinity, breakEven };
}

/**
 * The chef queues delivered fish and works through them at chef speed. While
 * there's a backlog the chef is full, so income is chef speed whatever you
 * deliver. Fish still gain the modifier when handed over, so the modifier
 * decides how much money the queue holds, not how fast it pays out.
 */
export interface Backlog {
  fish: number;
  /** When `fish` was read, in ms since epoch. */
  at: number;
}

/** Fish still queued at `now`, assuming nothing was delivered since the reading. */
export function backlogRemaining(b: Backlog | undefined, chefSpeed: number, now: number): number {
  if (!b || chefSpeed <= 0) return b?.fish ?? 0;
  return Math.max(0, b.fish - (chefSpeed * Math.max(0, now - b.at)) / 1000);
}

/**
 * Seconds until a backlog runs out if you keep delivering your whole catch at an
 * average modifier `m` (m = 0: no more deliveries). Infinity when it never does.
 */
export function backlogSeconds(remaining: number, chefSpeed: number, catchValue: number, m = 0): number {
  const net = chefSpeed - m * catchValue;
  return net > 0 ? remaining / net : Infinity;
}

/**
 * How to deliver, from the chef's capacity in units of your catch (chef speed ÷ catch):
 *   "picky":   above the usual ×1.5 max, so the chef can always absorb more.
 *              Deliver only at your highest rolls; holding fish costs nothing.
 *   "threshold": deliver at the break-even or higher; above it the chef is
 *              full anyway, so waiting for more gains nothing.
 *   "chef":    your catch fills the chef even at ×1, so the queue keeps growing;
 *              the modifier no longer changes income. Upgrade the chef.
 */
export function deliveryStrategy(catchValue: number, chefSpeed: number, usualMax = 1.5): "picky" | "threshold" | "chef" {
  const be = breakEvenModifier(catchValue, chefSpeed);
  if (be > usualMax) return "picky";
  if (be < 1) return "chef";
  return "threshold";
}
