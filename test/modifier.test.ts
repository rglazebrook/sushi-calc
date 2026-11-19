import assert from "node:assert/strict";
import { test } from "node:test";
import { breakEvenModifier, deliveryAdvice, incomeAtModifier } from "../src/modifier.ts";

test("break-even modifier is chef speed over catch value", () => {
  assert.ok(Math.abs(breakEvenModifier(1.63e6, 2.04e6) - 1.2515) < 1e-3);
  assert.equal(breakEvenModifier(0, 2e6), Infinity);
});

test("income is capped by the chef", () => {
  assert.equal(incomeAtModifier(1, 1.63e6, 2.04e6), 1.63e6);
  assert.equal(incomeAtModifier(1.5, 1.63e6, 2.04e6), 2.04e6);
  // Catch bigger than the chef: ×0.9 still fills it.
  assert.equal(incomeAtModifier(0.9, 3e6, 2e6), 2e6);
});

test("delivery advice", () => {
  const hold = deliveryAdvice(1, 100e6, 1.63e6, 2.04e6);
  assert.equal(hold.deliver, false);
  const go = deliveryAdvice(1.5, 100e6, 1.63e6, 2.04e6);
  assert.equal(go.deliver, true);
  assert.equal(go.chefReceives, 150e6);
  assert.ok(Math.abs(go.chefBusySeconds - 150e6 / 2.04e6) < 1e-9);
  assert.equal(deliveryAdvice(0.9, 0, 3e6, 2e6).deliver, true);
});

test("money multiplier formatting", async () => {
  const { perSecond } = await import("../src/format.ts");
  assert.equal(perSecond(1.63e6), "$1.63M/s");
  assert.equal(perSecond(1.63e6, 4), "$1.63M/s ($6.52M/s after ×4)");
  const { migrate } = await import("../src/web/store.ts");
  assert.equal(migrate({ moneyMultiplier: 4 }).moneyMultiplier, 4);
});

test("chef backlog drains at chef speed", async () => {
  const { backlogRemaining, backlogSeconds, deliveryStrategy } = await import("../src/modifier.ts");
  const b = { fish: 1.9e9, at: 0 };
  assert.equal(backlogRemaining(b, 2.8e6, 0), 1.9e9);
  assert.equal(backlogRemaining(b, 2.8e6, 100_000), 1.9e9 - 2.8e8);
  assert.equal(backlogRemaining(b, 2.8e6, 10_000_000), 0);
  // 1.9B at 2.8M/s with no deliveries: about 11m 19s.
  assert.ok(Math.abs(backlogSeconds(1.9e9, 2.8e6, 1.63e6) - 678.6) < 0.1);
  // Delivering your $1.63M/s catch at ×1.5 only shrinks the queue by 0.355M/s.
  assert.ok(Math.abs(backlogSeconds(1.9e9, 2.8e6, 1.63e6, 1.5) - 1.9e9 / 0.355e6) < 1);
  assert.equal(backlogSeconds(1e9, 2e6, 3e6, 1), Infinity);
  assert.equal(deliveryStrategy(1.63e6, 2.8e6), "picky");
  assert.equal(deliveryStrategy(1.63e6, 2.04e6), "threshold");
  assert.equal(deliveryStrategy(3e6, 2.8e6), "chef");
});
