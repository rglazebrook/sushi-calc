import { useEffect, useState } from "react";
import { chefModel, chefSpeedNow } from "../chef.ts";
import { backlogRemaining } from "../modifier.ts";
import { catchRate } from "../tiers.ts";
import { BalancePanel, DeliveryPanel } from "./BalancePanel.tsx";
import { BoatPanel } from "./BoatPanel.tsx";
import { ChefPanel } from "./ChefPanel.tsx";
import { HirePanel } from "./HirePanel.tsx";
import { derivePricing } from "./pricing-view.ts";
import { defaultState, useAppState } from "./store.ts";
import { NumberInput } from "./ui.tsx";

export function App() {
  const [state, setState] = useAppState();
  const pricing = derivePricing(state);
  const catchValue = pricing.count !== undefined && pricing.count > 0 ? catchRate(pricing.count).valuePerSecond : undefined;
  const chefSpeed = chefSpeedNow(chefModel, state.chefSpeed, state.chefUpgrades);
  const multiplier = state.moneyMultiplier && state.moneyMultiplier > 0 ? state.moneyMultiplier : 1;
  const now = useNow(state.chefBacklog ? 1000 : undefined);
  const backlog = chefSpeed !== undefined ? backlogRemaining(state.chefBacklog, chefSpeed, now) : 0;
  const setBacklog = (fish: number | undefined) => setState((s) => ({ ...s, chefBacklog: fish ? { fish, at: Date.now() } : undefined }));
  const balance = catchValue !== undefined && chefSpeed !== undefined ? { catchValue, chefSpeed, multiplier, backlog } : undefined;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">🍣 Sell a Million Sushi Calculator</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Hiring, chef upgrades and boat gambles for Sell a Million Sushi</p>
        </div>
        <div className="flex items-end gap-4">
          <label className="block w-36" title="Bought with Robux. It doesn't change amounts shown in game, only what you get when you collect.">
            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Money multiplier</span>
            <NumberInput
              value={state.moneyMultiplier}
              onChange={(v) => setState((s) => ({ ...s, moneyMultiplier: v }))}
              placeholder="1"
              label="Money multiplier"
              suffix="×"
            />
          </label>
          <button
            type="button"
            className="pb-2 text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
            onClick={() => confirm("Reset all readings and the chef speed to the defaults?") && setState(() => defaultState)}
          >
            Reset to defaults
          </button>
        </div>
      </header>

      {balance ? (
        <div className="sticky top-0 z-20 -mx-4 bg-slate-50/90 px-4 py-2 backdrop-blur dark:bg-slate-950/90">
          <BalancePanel {...balance} count={pricing.count ?? 0} />
        </div>
      ) : (
        <GettingStarted needsCount={catchValue === undefined} needsChef={chefSpeed === undefined} />
      )}

      <div className="mt-4 space-y-6">
        {balance && <DeliveryPanel {...balance} setBacklog={setBacklog} />}
        <HirePanel state={state} setState={setState} pricing={pricing} />
        <ChefPanel state={state} setState={setState} />
        <BoatPanel
          state={state}
          setState={setState}
          curve={pricing.curve}
          count={pricing.count}
          model={pricing.model}
          savingRate={balance ? Math.min(balance.catchValue, balance.chefSpeed) * multiplier : undefined}
          multiplier={multiplier}
        />
      </div>

      <footer className="mt-8 text-center text-xs text-slate-400">
        Your data is saved in this browser only. Vibed by <a href="https://rglazebrook.github.io" className="underline hover:text-slate-600 dark:hover:text-slate-300">Rob</a> with <span className="text-red-500">♥</span></footer>
    </div>
  );
}

/** The current time, re-read every `ms` (or once, when `ms` is undefined). */
function useNow(ms?: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!ms) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Shown until the player has entered what the summary needs. Everything they enter stays in this browser. */
function GettingStarted({ needsCount, needsChef }: { needsCount: boolean; needsChef: boolean }) {
  return (
    <section className="rounded-2xl border border-teal-200 bg-teal-50 px-5 py-4 text-sm text-teal-950 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-100">
      <h2 className="mb-1 text-base font-semibold">Getting started</h2>
      <p className="mb-2">Enter a couple of numbers from the game to see your income, chef and best boat at a glance:</p>
      <ol className="list-decimal space-y-0.5 pl-5">
        <li className={needsCount ? "" : "line-through opacity-60"}>
          Your total fishermen, in the <b>Hiring</b> card.
        </li>
        <li className={needsChef ? "" : "line-through opacity-60"}>
          Your chef's speed, in the <b>Chef</b> card.
        </li>
      </ol>
      <p className="mt-2 text-xs opacity-80">Optional: your money multiplier (top right) if you have purchased any. Everything you enter is saved in this browser only.</p>
    </section>
  );
}
