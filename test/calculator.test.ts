import { test } from "node:test";
import assert from "node:assert/strict";
import { addFishermen, computeIncome, rosterHireEquivalents } from "../src/calculator.ts";
import { evaluateGamble } from "../src/gamble.ts";
import { costOfHires, curveFromPad, fitCurve, geometricCurve, hiresAffordable } from "../src/pricing.ts";
import type { GameConfig, PlayerState } from "../src/types.ts";

const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

const config: GameConfig = {
  chefSecondsPerSushi: 1,
  mergeCount: 3,
  hirePadSizes: [1, 5, 25, 100],
  fish: [
    { tier: 1, name: "A", sushiPrice: 10, catchSeconds: 10, verified: true },
    { tier: 2, name: "B", sushiPrice: 40, catchSeconds: 10, verified: true },
  ],
};

const base = (fishermen: Record<number, number>): PlayerState => ({
  fishermen,
  cash: 0,
  padPrices: { 1: 19 },
  boosts: { sousChef: false, greeter: false, manager: false, doubleMoney: false },
  kitchenSpeedMultiplier: 1,
});

test("income: fisherman-limited and chef-limited", () => {
  close(computeIncome(config, base({ 1: 2 })).cashPerSecond, 2);
  const r = computeIncome(config, base({ 1: 10, 2: 10 }));
  assert.equal(r.bottleneck, "chef");
  close(r.cashPerSecond, 25);
});

test("auto-merge cascades 3-to-1", () => {
  assert.deepEqual(addFishermen({}, 1, 3, 3), { 1: 0, 2: 1 });
  assert.deepEqual(addFishermen({ 1: 2, 2: 2 }, 1, 1, 3), { 1: 0, 2: 0, 3: 1 });
  // Adding a T4 equals adding 27 T1 hires.
  const start = { 1: 2, 2: 1, 3: 2 };
  const viaHires = addFishermen(start, 1, 27, 3);
  const viaPrize = addFishermen(start, 4, 1, 3);
  assert.equal(rosterHireEquivalents(viaHires, 3), rosterHireEquivalents(viaPrize, 3));
  assert.deepEqual(clean(viaHires), clean(viaPrize));
});

test("pricing: flat and fitted growth", () => {
  const flat = fitCurve({ 100: 1_000_000 });
  assert.ok(flat.assumedFlat);
  close(costOfHires(flat, 27), 270_000);
  const truth = geometricCurve(1000, 1.02);
  const fitted = fitCurve({ 1: costOfHires(truth, 1), 100: costOfHires(truth, 100) });
  close(fitted.growth!, 1.02, 1e-6);
  close(fitted.next, 1000, 1e-6);
  assert.equal(hiresAffordable(flat, 95_000), 9);
  close(costOfHires(curveFromPad(100, 1_000_000, 1.01), 100), 1_000_000);
});

test("gamble: the $750k T4/T5/T6 example at a flat $10k per hire", () => {
  const r = evaluateGamble({ cost: 750_000, outcomes: [{ tier: 4, chance: 0.75 }, { tier: 5, chance: 0.2 }, { tier: 6, chance: 0.05 }] }, fitCurve({ 100: 1_000_000 }));
  close(r.expectedHires, 48.6);
  close(r.expectedValue, 486_000);
  assert.equal(r.worthIt, false);
  close(r.chanceOfProfit, 0.25);
  assert.equal(r.hiresForSameCash, 75);
});

function clean(r: Record<number, number>) {
  return Object.fromEntries(Object.entries(r).filter(([, n]) => n > 0));
}

test("price model: power law fitted to the in-game readings", async () => {
  const { fitModel, priceAt, curveAt } = await import("../src/pricing.ts");
  const readings = [
    { count: 43_952, price: 23_900 },
    { count: 103_001, price: 50_100 },
    { count: 122_684, price: 58_300 },
    { count: 122_792, price: 58_400 },
    { count: 300_039, price: 126_900 },
  ];
  const m = fitModel(readings)!;
  assert.equal(m.source, "observations");
  close(m.exponent, 0.869, 1e-3);
  assert.ok(m.maxError < 0.001, `max error ${m.maxError}`);
  // Integral shortcut matches a straight sum.
  const curve = curveAt(m, 300_039);
  let sum = 0;
  for (let i = 0; i < 243; i++) sum += priceAt(m, 300_039 + i);
  close(curve.costOf(243), sum, 1e-6);
  // One reading falls back to the measured exponent.
  const one = fitModel([{ count: 300_039, price: 126_900 }])!;
  assert.equal(one.source, "default");
  close(priceAt(one, 300_039), 126_900);
});

test("boat costs: fixed multiple of the Hire 1 price, outdated readings ignored", async () => {
  const { fitBoatMultiplier, fitModel, priceAt } = await import("../src/pricing.ts");
  const hire = fitModel([[43952,23900],[103001,50100],[122684,58300],[122792,58400],[300039,126900],[319776,134200],[497004,196900]].map(([count, price]) => ({ count, price })))!;
  // In-game Legendary readings: 143.6B is outdated, the other two agree.
  const legendary = fitBoatMultiplier([{ count: 497_004, cost: 143.6e9 }, { count: 517_551, cost: 230.7e9 }, { count: 519_738, cost: 231.5e9 }], hire)!;
  assert.deepEqual(legendary.ignored, [true, false, false]);
  close(legendary.multiplier, 1_131_200, 1e-3);
  // Rare: predicts its second reading from its first within 0.1%.
  const rare = fitBoatMultiplier([{ count: 497_004, cost: 168e6 }], hire)!;
  close(rare.multiplier * priceAt(hire, 517_551), 174e6, 1e-3);
  assert.equal(fitBoatMultiplier([{ cost: 1e6 }], hire), undefined);
});

test("tier breakdown: 519,765 fishermen after merging", async () => {
  const { tierBreakdown, tierLabel } = await import("../src/tiers.ts");
  assert.deepEqual(tierBreakdown(519_765), [
    { tier: 12, count: 2 }, { tier: 11, count: 2 }, { tier: 10, count: 2 }, { tier: 9, count: 1 }, { tier: 7, count: 1 },
    { tier: 6, count: 2 }, { tier: 5, count: 2 }, { tier: 4, count: 2 }, { tier: 3, count: 1 }, { tier: 2, count: 2 },
  ]);
  assert.equal(tierLabel(1), "T1 Sardine");
  assert.equal(tierLabel(12), "T12 Lionfish");
  assert.equal(tierLabel(99), "T99"); // no name in fishermen.json
});

test("saved data from the old boat format keeps every reading", async () => {
  const { migrate } = await import("../src/web/store.ts");
  const s = migrate({
    count: 519_765,
    observations: [{ id: "o", count: 497_004, hire1: 196_900 }],
    boats: [
      { name: "Rare", readings: [{ id: "a", count: 497_004, cost: 168e6 }, { id: "b", count: 517_551, cost: 174e6 }] },
      { name: "Epic", cost: 5.1e9 },
    ],
  });
  assert.equal(s.boatReadings.Rare!.length, 2);
  assert.equal(s.boatReadings.Epic![0]!.cost, 5.1e9);
  assert.equal(s.boatReadings.Epic![0]!.count, 519_765);
  assert.equal(s.observations.length, 1);
});

test("fish values and catch rate", async () => {
  const { fishValue, catchRate } = await import("../src/tiers.ts");
  const known = [{ tier: 1, value: 1 }, { tier: 6, value: 1100 }, { tier: 12, value: 3.7e6 }];
  assert.deepEqual(fishValue(6, known), { value: 1100, estimated: false });
  // Between T6 and T12 each tier multiplies by (3.7e6 / 1100)^(1/6).
  close(fishValue(9, known)!.value, 1100 * (3.7e6 / 1100) ** 0.5);
  assert.ok(fishValue(9, known)!.estimated);
  // Above the top known tier, the T6->T12 factor continues.
  close(fishValue(13, known)!.value, 3.7e6 * (3.7e6 / 1100) ** (1 / 6));
  // 3 T1 hires merge into one T2: 1 fish per 6s.
  const r = catchRate(3, known);
  close(r.fishPerSecond, 1 / 6);
  const big = catchRate(519_765, known);
  close(big.fishPerSecond, 17 / 6); // 17 fishermen after merging
});

test("fish value curve fits the in-game values from T4 up", async () => {
  const { fitFishCurve, fishValue } = await import("../src/tiers.ts");
  const known = [
    { tier: 1, value: 1 }, { tier: 2, value: 5 }, { tier: 3, value: 24 }, { tier: 4, value: 89 }, { tier: 5, value: 307 },
    { tier: 6, value: 1100 }, { tier: 7, value: 4000 }, { tier: 9, value: 59800 }, { tier: 10, value: 234800 },
    { tier: 11, value: 925000 }, { tier: 12, value: 3700000 },
  ];
  const curve = fitFishCurve(known)!;
  for (const p of known.filter((k) => k.tier >= 4)) close(curve.value(p.tier), p.value, 0.025); // ≤ 2.5% (T7 "4K" is coarse)
  close(curve.s, 2.5, 0.03); // ≈2.5; the exact figure shifts with rounding weights
  // Missing T8 comes from the curve, about 15.5K; known tiers stay exact.
  close(fishValue(8, known)!.value, 15_485, 0.005);
  assert.deepEqual(fishValue(3, known), { value: 24, estimated: false });
});

test("chef upgrades: power law of speed, start speed pinned by rounding", async () => {
  const { fitChef, nextUpgrade, sessionStartSpeed, upgradesToReach } = await import("../src/chef.ts");
  const session = {
    startSpeed: 1_800_000,
    upgrades: [
      { gain: 54_000, cost: 72.4e6 }, { gain: 56_000, cost: 75.2e6 }, { gain: 57_000, cost: 78e6 },
      { gain: 58_000, cost: 80.9e6 }, { gain: 60_000, cost: 83.9e6 },
    ],
    endSpeed: 2_000_000,
  };
  // 1.8M shown → 1.75–1.85M; 2.0M shown after +285K → start ≤ 1.765M.
  close(sessionStartSpeed(session), 1_757_500);
  const m = fitChef([session])!;
  close(m.lastSpeed, 2_042_500);
  // Reproduces each recorded upgrade within the game's rounding.
  let speed = sessionStartSpeed(session);
  for (const u of session.upgrades) {
    const p = nextUpgrade(m, speed);
    assert.ok(Math.abs(p.gain - u.gain) <= 500, `gain ${p.gain} vs ${u.gain}`);
    assert.ok(Math.abs(p.cost - u.cost) <= 50_000, `cost ${p.cost} vs ${u.cost}`);
    speed += u.gain;
  }
  const r = upgradesToReach(m, 2e6, 2.1e6);
  assert.ok(r.upgrades >= 1 && r.speed >= 2.1e6);
});

test("estimates in fishermen.json match the fitted curve", async () => {
  const { estimatedRows, fishValue } = await import("../src/tiers.ts");
  assert.ok(estimatedRows.length > 0);
  for (const { tier, value } of estimatedRows) {
    const v = fishValue(tier)!;
    assert.equal(v.estimated, true, `T${tier} should stay flagged as estimated`);
    // Written to 3 significant figures, so within 0.5% unless the curve has moved.
    assert.ok(Math.abs(value / v.value - 1) < 0.005, `T${tier}: file ${value}, curve ${v.value.toPrecision(4)}; re-run the estimate`);
  }
});

test("above the top known tier, the top tiers' growth continues", async () => {
  const { fitTopGrowth, fishValue } = await import("../src/tiers.ts");
  const upTo12 = [
    { tier: 4, value: 89 }, { tier: 5, value: 307 }, { tier: 6, value: 1100 }, { tier: 7, value: 4000 }, { tier: 9, value: 59800 },
    { tier: 10, value: 234800 }, { tier: 11, value: 925000 }, { tier: 12, value: 3700000 },
  ];
  const g = fitTopGrowth(upTo12)!;
  // Swordfish was later seen at 14.4M (±0.05M); the growth from T9–T12 should land close.
  close(fishValue(13, upTo12)!.value, 14.4e6, 0.012);
  const withT13 = fitTopGrowth([...upTo12, { tier: 13, value: 14.4e6 }])!;
  close(withT13.ratio, 3.94, 0.003);
});

test("chef: sessions linked by an unrecorded upgrade fit as one chain", async () => {
  const { fitChef, nextUpgrade } = await import("../src/chef.ts");
  const s1 = {
    startSpeed: 1_800_000,
    upgrades: [
      { gain: 54_000, cost: 72.4e6 }, { gain: 56_000, cost: 75.2e6 }, { gain: 57_000, cost: 78e6 },
      { gain: 58_000, cost: 80.9e6 }, { gain: 60_000, cost: 83.9e6 },
    ],
    endSpeed: 2_000_000,
  };
  const s2 = {
    upgradesBefore: 1,
    startSpeed: 2_100_000,
    upgrades: [
      { gain: 63_000, cost: 90.1e6 }, { gain: 64_000, cost: 93.4e6 }, { gain: 66_000, cost: 96.8e6 },
      { gain: 67_000, cost: 100.3e6 }, { gain: 69_000, cost: 103.8e6 },
    ],
    endSpeed: 2_500_000,
    next: { gain: 70_000, cost: 107.5e6 },
  };
  const m = fitChef([s1, s2])!;
  // The newest display (2.5M → 2.45–2.55M) is honoured.
  assert.ok(m.lastSpeed >= 2.45e6 && m.lastSpeed < 2.55e6, `lastSpeed ${m.lastSpeed}`);
  // Next upgrade as offered in game: +70K for $107.5M.
  const n = nextUpgrade(m, m.lastSpeed);
  assert.ok(Math.abs(n.gain - 70_000) <= 750, `gain ${n.gain}`);
  assert.ok(Math.abs(n.cost - 107.5e6) <= 150_000, `cost ${n.cost}`);
  // Every recorded upgrade within ~1.5 rounding steps (the in-game displays disagree by ~0.4%).
  let speed = m.lastSpeed - [...s1.upgrades, ...s2.upgrades].reduce((a, u) => a + u.gain, 0);
  const gap = (sp: number) => nextUpgrade(m, sp).gain;
  // Walk back the one unrecorded upgrade: find the speed before it.
  speed -= gap(speed + 285_000);
  for (const [i, u] of [...s1.upgrades, ...s2.upgrades].entries()) {
    if (i === 5) speed += gap(speed);
    const p = nextUpgrade(m, speed);
    assert.ok(Math.abs(p.gain - u.gain) <= 750, `#${i} gain ${p.gain.toFixed(0)} vs ${u.gain}`);
    assert.ok(Math.abs(p.cost - u.cost) <= 150_000, `#${i} cost ${p.cost.toFixed(0)} vs ${u.cost}`);
    speed += u.gain;
  }
});

test("no hire readings: prices come from the formula saved in hiring.json", async () => {
  const { derivePricing } = await import("../src/web/pricing-view.ts");
  const { priceAt } = await import("../src/pricing.ts");
  const p = derivePricing({ count: 519_765, observations: [], boatReadings: {} });
  assert.equal(p.model?.source, "builtin");
  close(p.model!.exponent, 0.869, 1e-3);
  close(priceAt(p.model!, 497_004), 196_900, 0.002);
  assert.ok(p.curve && p.curve.next > 200_000);
  // A reading without a count doesn't block the formula.
  const q = derivePricing({ count: 519_765, observations: [{ id: "x", hire1: 23_800 }], boatReadings: {} });
  assert.equal(q.model?.source, "builtin");
  // With no count, nothing player-specific is assumed: the formula is known but no prices are shown yet.
  const fresh = derivePricing({ observations: [], boatReadings: {} });
  assert.equal(fresh.count, undefined);
  assert.equal(fresh.curve, undefined);
  assert.equal(fresh.model?.source, "builtin");
});

test("time to save for a boat", async () => {
  const { saveTime } = await import("../src/boats.ts");
  const { duration } = await import("../src/format.ts");
  assert.equal(saveTime(60e9, 6.52e6), 60e9 / 6.52e6); // ~2.6 hours of pure saving
  assert.equal(saveTime(60e9, 6.52e6, 10e9), 50e9 / 6.52e6);
  assert.equal(saveTime(4e6, 6.52e6, 5e6), 0);
  assert.equal(duration(60e9 / 6.52e6), "2.6h");
  assert.equal(duration(5 * 86400), "5.0d");
});

test("chef estimate follows upgrades bought since chef.json", async () => {
  const { chefModel, chefSpeedNow, nextUpgrade, speedAfter, upgradesFromSpeed } = await import("../src/chef.ts");
  const m = chefModel!;
  assert.equal(chefSpeedNow(m, undefined, 0), m.lastSpeed);
  const after3 = speedAfter(m, 3);
  close(after3 - m.lastSpeed, nextUpgrade(m, m.lastSpeed).gain + nextUpgrade(m, speedAfter(m, 1)).gain + nextUpgrade(m, speedAfter(m, 2)).gain);
  assert.equal(chefSpeedNow(m, undefined, 3), after3);
  assert.equal(chefSpeedNow(m, 3.6e6, 3), 3.6e6); // a typed speed wins
  // A speed read in game snaps to the nearest upgrade count, and back again.
  assert.equal(upgradesFromSpeed(m, after3), 3);
  assert.equal(upgradesFromSpeed(m, 1e6), 0);
  const n = upgradesFromSpeed(m, 3.6e6);
  assert.ok(Math.abs(speedAfter(m, n) - 3.6e6) <= nextUpgrade(m, 3.6e6).gain / 2 + 1, `n=${n} → ${speedAfter(m, n)}`);
});

test("boat costs from boats.json follow a new player's count", async () => {
  const { boatTypes } = await import("../src/boats.ts");
  const { builtinModel } = await import("../src/web/pricing-view.ts");
  const { boatCost } = await import("../src/web/boat-cost.ts");
  for (const boat of boatTypes.filter((b) => b.costReadings?.length)) {
    const { cost, fromSaved, fit } = boatCost([], 519_738, builtinModel, boat.costReadings);
    assert.equal(fromSaved, true, boat.name);
    assert.ok(fit && fit.ignored.every((x) => !x), `${boat.name}: no saved reading should be an outlier`);
    // Every saved reading is reproduced within the game's display rounding (one decimal place, so ≤ ~1% at 5.5M).
    for (const r of boat.costReadings!) close(boatCost([], r.count, builtinModel, boat.costReadings).cost!, r.cost, 0.012);
    assert.ok(cost! > 0);
  }
  // A player's own reading wins over the saved ones.
  const rare = boatTypes.find((b) => b.name === "Rare")!;
  const own = boatCost([{ id: "x", count: 519_738, cost: 200e6 }], 519_738, builtinModel, rare.costReadings);
  assert.equal(own.fromSaved, false);
  close(own.cost!, 200e6, 1e-9);
});
