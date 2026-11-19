import { useEffect, useState } from "react";
import { boatTypes, saveTime, type BoatType } from "../boats.ts";
import { boatCost } from "./boat-cost.ts";
import { hireEquivalent } from "../calculator.ts";
import { duration, money, multiplierLabel, pct } from "../format.ts";
import { evaluateGamble, type GambleReport } from "../gamble.ts";
import { costOfHires, type BoatFit, type PriceCurve, type PriceModel } from "../pricing.ts";
import { tierLabel } from "../tiers.ts";
import { newId, useCollapsed, type AppState, type BoatReading } from "./store.ts";
import { Button, Card, Field, MoneyInput, NumberInput, Stat } from "./ui.tsx";

type SetState = (f: (s: AppState) => AppState) => void;

function report(boat: BoatType, cost: number | undefined, curve?: PriceCurve): GambleReport | undefined {
  if (!curve || !cost || boat.outcomes.length === 0) return undefined;
  return evaluateGamble({ cost, outcomes: boat.outcomes.map((o) => ({ tier: o.tier, chance: o.chance / 100 })) }, curve);
}


interface BoatPanelProps {
  state: AppState;
  setState: SetState;
  curve?: PriceCurve;
  count?: number;
  model?: PriceModel;
  /** Money collected per second (income at ×1 fish value, after the money multiplier). */
  savingRate?: number;
  multiplier: number;
}

export function BoatPanel({ state, setState, curve, count, model, savingRate, multiplier }: BoatPanelProps) {
  // Cash changes by the second, so it isn't saved.
  const [cash, setCash] = useState<number>();
  const setReadings = (s: AppState, name: string, readings: BoatReading[]): AppState => ({ ...s, boatReadings: { ...s.boatReadings, [name]: readings } });

  // The newest reading on a boat is the player's latest numbers, so its count becomes the current count.
  const updateReading = (name: string, readingId: string, patch: Partial<BoatReading>) =>
    setState((s) => {
      const readings = s.boatReadings[name] ?? [];
      const isLatest = readings.at(-1)?.id === readingId;
      const next = setReadings(s, name, readings.map((r) => (r.id === readingId ? { ...r, ...patch } : r)));
      return isLatest && patch.count !== undefined ? { ...next, count: patch.count } : next;
    });
  const addReading = (name: string) => setState((s) => setReadings(s, name, [...(s.boatReadings[name] ?? []), { id: newId(), count: s.count ?? count }]));
  const removeReading = (name: string, readingId: string) =>
    setState((s) => setReadings(s, name, (s.boatReadings[name] ?? []).filter((r) => r.id !== readingId)));

  const rows = boatTypes.map((boat) => {
    const readings = state.boatReadings[boat.name] ?? [];
    const { fit, cost, fromSaved } = boatCost(readings, count, model, boat.costReadings);
    return { boat, readings, fit: count !== undefined ? fit : undefined, fromSaved, cost, r: report(boat, cost, curve) };
  });
  const ignoredCount = rows.reduce((s, x) => s + (x.fit?.ignored.filter(Boolean).length ?? 0), 0);
  const [collapsed, toggle] = useCollapsed("boats");
  // Collapsed boats are ones the player has set aside (say, unaffordable for now), so they're never recommended.
  const scored = rows.filter((x) => x.r && !collapsed.has(x.boat.name));
  const setAside = rows.filter((x) => collapsed.has(x.boat.name)).map((x) => x.boat.name);
  const best = scored.length ? scored.reduce((a, b) => (b.r!.valuePerDollar > a.r!.valuePerDollar ? b : a)) : undefined;
  const hire100 = curve ? costOfHires(curve, 100) : undefined;

  return (
    <Card title="Boat gambling" subtitle="A T(n) fisherman equals 3^(n−1) hires, so each prize is worth what those hires would cost you now.">
      <p className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {!model ? (
          <>Add hire price readings above so boat costs can follow your fisherman count.</>
        ) : (
          <>
            Each boat costs a <b>fixed number of Hire 1 prices</b>, so boat costs follow your count exactly like hiring does. If the boat estimate seems 
            inaccurate, add your own cost reading (current fishermen count + boat gamble cost). Your own readings replace the saved data.
            {ignoredCount > 0 && ` ${ignoredCount} reading${ignoredCount > 1 ? "s are" : " is"} more than 3% off the rest and ignored (likely outdated).`}
          </>
        )}
      </p>

      {savingRate !== undefined && savingRate > 0 && (
        <div className="mb-4 grid items-end gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
          <Field label="Cash on hand (optional)">
            <MoneyInput value={cash} onChange={setCash} label="Cash on hand" placeholder="e.g. 2.5b" />
          </Field>
          <p className="pb-2 text-xs text-slate-500 dark:text-slate-400">
            Time to save assumes you earn {money(savingRate)}/s (income at ×1 fish value{multiplier > 1 ? `, after ${multiplierLabel(multiplier)} permanent multiplier` : ""}) and don't
            hire meanwhile, so boat costs stay put.
          </p>
        </div>
      )}

      {best && hire100 && (
        <div
          className={`mb-4 rounded-xl px-4 py-3 text-sm ${best.r!.worthIt ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}
        >
          {best.r!.worthIt ? (
            <>
              Best boat: <b>{best.boat.name}</b>. You get back <b>${best.r!.valuePerDollar.toFixed(2)}</b> per $1 on average. That's{" "}
              {money(best.cost! / best.r!.expectedHires)} per hire, compared with {money(hire100 / 100)} each from Hire 100.
            </>
          ) : (
            <>No boat beats hiring right now. Hire 100 costs {money(hire100 / 100)} per fisherman.</>
          )}
          {setAside.length > 0 && <span className="opacity-75"> Not counting collapsed: {setAside.join(", ")}.</span>}
        </div>
      )}
      {!best && setAside.length > 0 && scored.length === 0 && rows.some((x) => x.r) && (
        <p className="mb-4 text-sm text-slate-500">Every valued boat is collapsed, so there's no recommendation. Expand a boat to include it.</p>
      )}
      {!curve && <p className="mb-4 text-sm text-slate-500">Enter your fisherman count above to value the boats.</p>}

      <div className="grid items-start gap-4 md:grid-cols-2">
        {rows.map(({ boat, readings, fit, fromSaved, cost, r }) => (
          <BoatCard
            key={boat.name}
            boat={boat}
            readings={readings}
            cost={cost}
            fit={fit}
            fromSaved={fromSaved}
            count={count}
            r={r}
            save={cost && savingRate ? saveTime(cost, savingRate, cash) : undefined}
            collapsed={collapsed.has(boat.name)}
            onToggle={() => toggle(boat.name)}
            addReading={() => addReading(boat.name)}
            updateReading={(id, p) => updateReading(boat.name, id, p)}
            removeReading={(id) => removeReading(boat.name, id)}
            onWin={(tier) => {
              setState((s) => ({ ...s, count: (s.count ?? count ?? 0) + hireEquivalent(tier, 3) }));
              // Pay for the boat out of the cash entered, at its cost before the prize raises prices.
              if (cash === undefined || !cost) return undefined;
              setCash(Math.max(0, cash - cost));
              return cost;
            }}
          />
        ))}
      </div>
    </Card>
  );
}

interface BoatCardProps {
  boat: BoatType;
  readings: BoatReading[];
  cost?: number;
  /** Multiplier fit, when costs follow the count. */
  fit?: BoatFit;
  /** The fit comes from boats.json, not the player's own readings. */
  fromSaved?: boolean;
  count?: number;
  r?: GambleReport;
  /** Seconds of saving to afford this boat (0 = affordable now). */
  save?: number;
  collapsed: boolean;
  onToggle: () => void;
  addReading: () => void;
  updateReading: (readingId: string, p: Partial<BoatReading>) => void;
  removeReading: (readingId: string) => void;
  /** The player won this prize tier; returns what was taken from cash on hand, if any. */
  onWin: (tier: number) => number | undefined;
}

function BoatCard({ boat, readings, cost, fit, fromSaved, count, r, save, collapsed, onToggle, addReading, updateReading, removeReading, onWin }: BoatCardProps) {
  const totalChance = boat.outcomes.reduce((s, o) => s + o.chance, 0);
  // Per-reading deviations only make sense against the player's own readings.
  const ownFit = fromSaved ? undefined : fit;
  const [justWon, setJustWon] = useState<number>();
  const [paid, setPaid] = useState<number>();
  useEffect(() => {
    if (justWon === undefined) return;
    const t = setTimeout(() => setJustWon(undefined), 4000);
    return () => clearTimeout(t);
  }, [justWon]);
  const win = (tier: number) => {
    setPaid(onWin(tier));
    setJustWon(tier);
  };

  return (
    <div className={`rounded-xl border border-slate-200 dark:border-slate-800 ${collapsed ? "px-4 py-2.5" : "p-4"}`}>
      <div className={`flex items-center justify-between gap-2 ${collapsed ? "" : "mb-3"}`}>
        <h3 className="min-w-0 text-lg font-semibold">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            className="flex items-center gap-2 rounded-md text-left outline-none hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-500/40 dark:hover:text-teal-300"
            title={collapsed ? "Expand, and include this boat in the best-boat pick" : "Collapse, and leave this boat out of the best-boat pick"}
          >
            <svg aria-hidden viewBox="0 0 16 16" className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${collapsed ? "" : "rotate-90"}`}>
              <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {boat.name}
          </button>
        </h3>
        {collapsed ? (
          <span className="shrink-0 text-base tabular-nums text-slate-500 dark:text-slate-400">
            {cost ? money(cost) : ""}
            {save !== undefined && <span className="text-sm"> · {save === 0 ? "affordable" : `${duration(save)} to save`}</span>}
          </span>
        ) : r && (
          <span
            title={`On average you get back $${r.valuePerDollar.toFixed(2)} in fishermen for every $1 this boat costs${r.worthIt ? "" : ", less than you put in"}`}
            aria-label={`Returns $${r.valuePerDollar.toFixed(2)} per $1${r.worthIt ? "" : ", skip it"}`}
            className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${r.worthIt ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100" : "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100"}`}
          >
            {r.worthIt ? "" : "Skip · "}×{r.valuePerDollar.toFixed(2)}
          </span>
        )}
      </div>
      {!collapsed && (
        <>

      <div className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Cost now{fit && count !== undefined ? ` at ${count.toLocaleString()} fishermen` : cost ? " (as entered)" : ""}
          </span>
          <span className="text-xl font-semibold tabular-nums">{cost ? money(cost) : "–"}</span>
        </div>
        {fit && (
          <div className="text-right text-xs text-slate-400 tabular-nums">
            = {fit.multiplier.toLocaleString("en-US", { maximumSignificantDigits: 5 })} × Hire 1 price{fromSaved ? " (from saved game data)" : ""}
          </div>
        )}
        {save !== undefined && (
          <div className="mt-1.5 flex items-baseline justify-between border-t border-slate-200 pt-1.5 dark:border-slate-700">
            <span className="text-xs text-slate-500 dark:text-slate-400">Time to save</span>
            <span className={`text-sm font-semibold tabular-nums ${save === 0 ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
              {save === 0 ? "Affordable now" : duration(save)}
            </span>
          </div>
        )}
      </div>

      <details className="mt-2" open={readings.length === 0 && !fit}>
        <summary className="cursor-pointer select-none text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          Cost readings ({readings.length})
        </summary>
        <div className="mt-2 space-y-1.5">
          {readings.map((rd, i) => (
            <div key={rd.id} className="grid grid-cols-[1fr_1fr_3.5rem_auto] items-center gap-2">
              <NumberInput value={rd.count} onChange={(v) => updateReading(rd.id, { count: v })} placeholder="fishermen" label="Boat reading fisherman count" />
              <MoneyInput value={rd.cost} onChange={(v) => updateReading(rd.id, { cost: v })} label={`${boat.name} cost reading`} />
              <span
                className={`text-right text-xs tabular-nums ${ownFit?.ignored[i] ? "text-amber-600 dark:text-amber-400" : "text-slate-400"}`}
                title={ownFit?.ignored[i] ? "More than 3% off this boat's other readings; ignored as likely outdated" : "Difference from the fitted cost"}
              >
                {ownFit?.ignored[i] ? "ignored" : ownFit?.deviations[i] !== undefined ? `${ownFit.deviations[i]! >= 0 ? "+" : ""}${(ownFit.deviations[i]! * 100).toFixed(1)}%` : ""}
              </span>
              <Button variant="danger" onClick={() => removeReading(rd.id)} title="Remove reading">
                ✕
              </Button>
            </div>
          ))}
          <Button onClick={addReading}>+ Cost seen now</Button>
        </div>
      </details>

      <table className="mt-3 w-full text-base">
        <thead>
          <tr className="text-left text-sm text-slate-500 dark:text-slate-400">
            <th className="pb-1 font-medium">Prize</th>
            <th className="pb-1 text-right font-medium">Chance</th>
            <th className="pb-1 text-right font-medium">Worth</th>
          </tr>
        </thead>
        <tbody>
          {boat.outcomes.map((o) => {
            const value = r?.outcomes.find((x) => x.tier === o.tier);
            const adds = hireEquivalent(o.tier, 3);
            return (
              <tr
                key={o.tier}
                role="button"
                tabIndex={0}
                title={`I won a ${tierLabel(o.tier)}: add ${adds.toLocaleString()} to my fishermen`}
                aria-label={`Won ${tierLabel(o.tier)}`}
                onClick={() => win(o.tier)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), win(o.tier))}
                className="cursor-pointer outline-none hover:bg-teal-50 focus-visible:bg-teal-50 dark:hover:bg-teal-950 dark:focus-visible:bg-teal-950"
              >
                <td className="rounded-l-md py-2 pl-2">{tierLabel(o.tier)}</td>
                <td className="py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{o.chance}%</td>
                <td
                  className={`rounded-r-md py-2 pr-2 text-right tabular-nums ${value && cost && value.hireCost > cost ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}`}
                >
                  {value ? money(value.hireCost) : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 min-h-5 text-sm text-teal-700 dark:text-teal-300" aria-live="polite">
        {justWon ? `Added ${hireEquivalent(justWon, 3).toLocaleString()} fishermen for your ${tierLabel(justWon)}${paid ? ` and took ${money(paid)} from your cash` : ""}.` : <span className="text-slate-400">Won a prize? Click its row.</span>}
      </p>
      {Math.abs(totalChance - 100) > 0.01 && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Chances in boats.json add to {totalChance}%</p>}

      {r && cost ? (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
          <Stat label="Back per $1 bet" value={`$${r.valuePerDollar.toFixed(2)}`} tone={r.worthIt ? "good" : "bad"} />
          <Stat label="Average prize" value={money(r.expectedValue)} />
          <Stat label="Average hires won" value={r.expectedHires.toFixed(1)} />
          <Stat label="Same cash at pads" value={`${r.hiresForSameCash} hires`} />
          <Stat label="Chance to beat cost" value={pct(r.chanceOfProfit)} />
          <Stat label="Cost per avg hire" value={money(cost / r.expectedHires)} />
        </div>
      ) : (
        <p className="mt-4 text-xs text-slate-400">Add a cost reading to value this boat.</p>
      )}
        </>
      )}
    </div>
  );
}
