import { money, multiplierLabel, pct } from "../format.ts";
import { CATCH_SECONDS, catchRate, tierLabel } from "../tiers.ts";
import { costOfHires, DEFAULT_EXPONENT, priceAt } from "../pricing.ts";
import type { PricingView } from "./pricing-view.ts";
import { newId, type AppState, type Observation } from "./store.ts";
import { Button, Card, Field, MoneyInput, NumberInput, Stat } from "./ui.tsx";

const PADS = [1, 5, 25, 100];

export function HirePanel({ state, setState, pricing }: { state: AppState; setState: (f: (s: AppState) => AppState) => void; pricing: PricingView }) {
  const { curve, model, count } = pricing;

  const setCount = (c: number | undefined) => setState((s) => ({ ...s, count: c }));
  const hired = (n: number) => setState((s) => ({ ...s, count: (s.count ?? count ?? 0) + n }));
  // The newest reading (last row) is the player's latest numbers, so its count becomes the current count.
  const updateObs = (id: string, patch: Partial<Observation>) =>
    setState((s) => {
      const isLatest = s.observations.at(-1)?.id === id;
      return {
        ...s,
        count: isLatest && patch.count !== undefined ? patch.count : s.count,
        observations: s.observations.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      };
    });
  const removeObs = (id: string) => setState((s) => ({ ...s, observations: s.observations.filter((o) => o.id !== id) }));
  const addObs = () =>
    setState((s) => ({
      ...s,
      observations: [...s.observations, { id: newId(), count: s.count ?? count, hire1: undefined, hire100: undefined }],
    }));

  const needsCount = state.observations.some((o) => o.hire1 && o.count === undefined);
  const mult = state.moneyMultiplier ?? 1;
  const rate = count !== undefined && count > 0 ? catchRate(count) : undefined;

  return (
    <Card title="Hiring" subtitle="Enter your fisherman count; prices follow from your readings.">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Field label="Total fishermen now">
            <NumberInput value={state.count ?? count} onChange={setCount} placeholder="e.g. 340" label="Total fishermen now" />
          </Field>
          <div>
            <div className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">I just hired…</div>
            <div className="flex flex-wrap gap-2">
              {PADS.map((n) => (
                <Button key={n} onClick={() => hired(n)}>
                  +{n}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-400">Won a boat prize? Click its tier on the boat card below.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PADS.map((n) => (
            <div key={n} className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">Hire {n}</div>
              <div className="text-lg font-semibold tabular-nums">{curve ? money(costOfHires(curve, n)) : "–"}</div>
              {curve && n > 1 && <div className="text-xs text-slate-400 tabular-nums">{money(costOfHires(curve, n) / n)} each</div>}
            </div>
          ))}
        </div>
      </div>

      {rate && count !== undefined && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="flex gap-6 rounded-xl bg-teal-50 px-4 py-3 dark:bg-teal-950">
            <Stat label="Fish caught" value={`${rate.fishPerSecond.toFixed(2)}/s`} />
            <Stat
              label={rate.estimated ? "Fish value (est.)" : "Fish value"}
              value={
                <>
                  {money(rate.valuePerSecond)}/s
                  {mult > 1 && (
                    <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                      {money(rate.valuePerSecond * mult)}/s after {multiplierLabel(mult)}
                    </span>
                  )}
                </>
              }
            />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">Your {count.toLocaleString()} fishermen after merging</div>
            <div className="flex flex-wrap gap-1.5">
              {rate.byTier.map((t) => (
                <span
                  key={t.tier}
                  title={
                    t.fishValue !== undefined
                      ? `${tierLabel(t.tier)} fish worth ${t.estimated ? "about " : ""}${money(t.fishValue)}; ${money(t.valuePerSecond)}/s from these ${t.fishermen}`
                      : undefined
                  }
                  className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800 tabular-nums dark:bg-teal-950 dark:text-teal-200"
                >
                  {t.fishermen} × {tierLabel(t.tier)}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Estimating one fish per fisherman every {CATCH_SECONDS}s. Hover a tier for its share.
            </p>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <Stat label="Formula" value={model ? `${model.scale.toPrecision(4)} × n^${model.exponent.toFixed(3)}` : "–"} />
        <Stat label="Next hire adds" value={curve ? (curve.assumedFlat ? "unknown" : money(curve.nextIncrease)) : "–"} />
        <Stat label="+1,000 hires adds" value={model && count !== undefined ? money(priceAt(model, count + 1000) - priceAt(model, count)) : "–"} />
        <p className="max-w-md self-center text-xs text-slate-500 dark:text-slate-400">{describeModel(pricing)}</p>
      </div>

      <details className="mt-5" open={needsCount || pricing.model?.source === "default" || !pricing.model}>
        <summary className="cursor-pointer select-none text-sm font-semibold">Price readings ({state.observations.length})</summary>
        <p className="mb-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
          Note your fisherman count and what the first pad shows. Two readings at counts far apart (say 100+ hires) let the calculator work out the
          price formula, so later you only need to update your count. Entering a count in the newest reading also updates your total
          fishermen.
        </p>
        {needsCount && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Enter the fisherman count for each reading so prices can update as your count changes.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                <th className="pb-1 pr-2 font-medium">Fishermen</th>
                <th className="pb-1 pr-2 font-medium">Hire 1</th>
                <th className="pb-1 font-medium text-right">Fit</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.observations.map((o) => (
                <tr key={o.id}>
                  <td className="py-1 pr-2">
                    <NumberInput value={o.count} onChange={(v) => updateObs(o.id, { count: v })} placeholder="count" label="Fisherman count" />
                  </td>
                  <td className="py-1 pr-2">
                    <MoneyInput value={o.hire1} onChange={(v) => updateObs(o.id, { hire1: v })} placeholder="23.8k" label="Hire 1 price" />
                  </td>
                  <td className="py-1 text-right text-xs tabular-nums text-slate-500">{fitError(pricing, o)}</td>
                  <td className="py-1 pl-1 text-right">
                    <Button variant="danger" onClick={() => removeObs(o.id)} title="Remove reading">
                      ✕
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2">
          <Button onClick={addObs}>+ Add reading</Button>
        </div>
      </details>
    </Card>
  );
}

function fitError(p: PricingView, o: Observation): string {
  if (!p.model || p.model.source !== "observations" || o.count === undefined || !o.hire1) return "";
  const predicted = priceAt(p.model, o.count);
  const err = predicted / o.hire1 - 1;
  return `${err >= 0 ? "+" : ""}${(err * 100).toFixed(1)}%`;
}

function describeModel(p: PricingView): string {
  if (!p.curve) return p.model ? "Enter your total fishermen to see hire prices." : "Add a reading with your Hire 1 price to get started.";
  if (!p.model) return "Using the latest reading as-is. Add its fisherman count so prices can follow your count.";
  switch (p.model.source) {
    case "observations": {
      const err = `${(p.model.maxError * 100).toFixed(2)}%`;
      return p.model.maxError > 0.02
        ? `Fitted from ${p.usable.length} readings, but some are up to ${err} off the curve. Check the readings with large Fit values.`
        : `Fitted from ${p.usable.length} readings, all within ${err}. Prices update from your count alone.`;
    }
    case "builtin":
      return `No readings of your own, so using the formula fitted from the ${p.model.maxError < 0.002 ? "in-game readings" : "readings"} saved in data. Add a reading if prices look off.`;
    case "default":
      return `One reading, so the exponent ${DEFAULT_EXPONENT} measured earlier is assumed. Add a second reading at a different count to confirm it.`;
  }
}
