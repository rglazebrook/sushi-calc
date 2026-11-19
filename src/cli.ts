import { existsSync, readFileSync } from "node:fs";
import { affordableHires, computeIncome, evaluateHirePads } from "./calculator.ts";
import { defaultConfig } from "./data.ts";
import { duration, money, pct } from "./format.ts";
import { fitCurve } from "./pricing.ts";
import type { PlayerState } from "./types.ts";

// Usage: npm run calc [-- path/to/state.json]
// Your own state.json (not published) if you've made one, otherwise the example.
const statePath = process.argv[2] ?? (existsSync("state.json") ? "state.json" : "state.example.json");
const state = JSON.parse(readFileSync(statePath, "utf8")) as PlayerState;
const config = defaultConfig;
const r = computeIncome(config, state);

console.log("=== Sell a Million Sushi calculator ===\n");
console.log("Fishermen:");
for (const f of r.flows) {
  const flag = f.fish.verified ? "" : "  (placeholder data)";
  console.log(
    `  ${f.fishermen} x T${f.fish.tier} ${f.fish.name.padEnd(10)} ${f.fishPerSecond.toFixed(2)} fish/s @ ${money(f.pricePerSushi)}${flag}`,
  );
}
console.log();
console.log(`Fish supply:     ${r.supplyPerSecond.toFixed(2)} /s`);
console.log(`Chef capacity:   ${r.chefCapacityPerSecond.toFixed(2)} /s  (${pct(r.chefUtilization)} busy)`);
console.log(`Bottleneck:      ${r.bottleneck}`);
console.log(`Income:          ${money(r.cashPerSecond)}/s  ${money(r.cashPerHour)}/h`);

const curve = fitCurve(state.padPrices);
console.log(
  `\nHire price: next ${money(curve.next)}${curve.assumedFlat ? " (flat, assumed)" : `, +${pct((curve.growth ?? 1) - 1)} per hire`}. ` +
    `Your ${money(state.cash)} buys ${affordableHires(state)}.`,
);
console.log("Hire pads:");
for (const h of evaluateHirePads(config, state)) {
  const gain = `${h.deltaCashPerSecond >= 0 ? "+" : ""}${money(h.deltaCashPerSecond)}/s`;
  console.log(
    `  Hire ${String(h.count).padEnd(4)} ${money(h.cost).padStart(9)}  ${gain.padStart(11)}  payback ${duration(h.paybackSeconds).padStart(6)}  wait ${duration(h.waitSeconds)}`,
  );
}
