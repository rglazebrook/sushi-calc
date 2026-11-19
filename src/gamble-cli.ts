import { existsSync, readFileSync } from "node:fs";
import { defaultConfig } from "./data.ts";
import { money, parseMoney, pct } from "./format.ts";
import { breakevenGrowth, evaluateGamble, type Gamble } from "./gamble.ts";
import { fitCurve } from "./pricing.ts";

const USAGE = `Usage: npm run gamble -- <cost> <tier>:<percent> ... [--pad <size>=<price> ...]

  npm run gamble -- 750k 4:75 5:20 6:5 --pad 100=1m
  npm run gamble -- 750k 4:75 5:20 6:5 --pad 1=4k --pad 100=1m

Pad prices are what the hire pads show right now. Without --pad, they are read
from state.json (or state.example.json). Give at least two pads so the price growth can be measured.`;

const args = process.argv.slice(2);
if (args.length < 2 || args.includes("--help")) {
  console.log(USAGE);
  process.exit(args.length < 2 ? 1 : 0);
}

let cost: number | undefined;
const outcomes: Gamble["outcomes"] = [];
const pads: Record<number, number> = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a === "--pad") {
    const [size, price] = (args[++i] ?? "").split("=");
    pads[Number(size)] = parseMoney(price ?? "");
  } else if (a.includes(":")) {
    const [tier, chance] = a.split(":");
    outcomes.push({ tier: Number(tier), chance: Number(chance!.replace("%", "")) / 100 });
  } else {
    cost = parseMoney(a);
  }
}
if (cost === undefined || outcomes.length === 0) {
  console.log(USAGE);
  process.exit(1);
}
const stateFile = existsSync("state.json") ? "state.json" : existsSync("state.example.json") ? "state.example.json" : undefined;
if (Object.keys(pads).length === 0 && stateFile) {
  Object.assign(pads, JSON.parse(readFileSync(stateFile, "utf8")).padPrices);
}

const gamble: Gamble = { cost, outcomes };
const curve = fitCurve(pads);
const r = evaluateGamble(gamble, curve, defaultConfig.mergeCount);

console.log(`=== Boat gamble: ${money(cost)} ===\n`);
console.log(
  curve.assumedFlat
    ? `Hire price: ${money(curve.next)} each (FLAT, assumed: only one pad price given)`
    : `Hire price: next ${money(curve.next)}, rising ${pct((curve.growth ?? 1) - 1)} per hire`,
);
const perHire = Object.entries(pads).map(([size, price]) => ({ size: Number(size), each: price / Number(size) }));
const cheapest = perHire.reduce((a, b) => (b.each < a.each ? b : a));
if (cheapest.each < curve.next - 0.5) {
  console.log(
    `WARNING: the ${cheapest.size}-pad works out to ${money(cheapest.each)} each, cheaper than a single hire.\n` +
      `That does not fit "each hire raises the price". Check the pad prices; prices above assume no bulk discount.`,
  );
}
console.log();
console.log("  Prize   Chance   = Hires   Cost to hire them");
for (const o of r.outcomes) {
  const mark = o.hireCost > cost ? "  > gamble cost" : "";
  console.log(
    `  T${String(o.tier).padEnd(5)} ${pct(o.chance).padStart(6)}   ${String(o.hires).padStart(7)}   ${money(o.hireCost).padStart(10)}${mark}`,
  );
}
if (Math.abs(r.totalChance - 1) > 0.001) {
  console.log(`  (chances add up to ${pct(r.totalChance)}; the rest is treated as winning nothing)`);
}
console.log();
console.log(`Expected prize:   ${r.expectedHires.toFixed(1)} hires, worth ${money(r.expectedValue)}`);
console.log(`Same cash at pads: ${r.hiresForSameCash} hires`);
console.log(`Value per $1 bet: ${r.valuePerDollar.toFixed(2)}  (expected ${r.expectedProfit >= 0 ? "gain" : "loss"} ${money(Math.abs(r.expectedProfit))})`);
console.log(`Chance prize beats what you paid: ${pct(r.chanceOfProfit)}`);
console.log();
console.log(r.worthIt ? "VERDICT: TAKE THE GAMBLE (on average)." : "VERDICT: SKIP IT. Hiring is better value.");

if (curve.assumedFlat) {
  const [size, price] = Object.entries(pads)[0]!;
  const g = breakevenGrowth(gamble, Number(size), price, defaultConfig.mergeCount);
  console.log(
    g === undefined
      ? "\nWith rising prices it is still not worth it (checked up to 20% per hire)."
      : g > 1
        ? `\nIf the price rises more than ${pct(g - 1)} per hire, the verdict flips. Add a second --pad to check.`
        : "",
  );
}
