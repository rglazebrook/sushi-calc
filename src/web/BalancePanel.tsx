import { useState } from "react";
import { chefModel, nextUpgrade, upgradesToReach } from "../chef.ts";
import { clock, duration, money, multiplierLabel, perSecond } from "../format.ts";
import { backlogSeconds, breakEvenModifier, deliveryStrategy } from "../modifier.ts";
import { Button, Card, Field, MoneyInput, NumberInput } from "./ui.tsx";

/** Within this fraction, catch and chef count as balanced. */
const BALANCE = 0.02;
/** Bar colours, validated for colour-blind separation and contrast on the light and dark card surfaces. */
const TEAL = "#0d9488";
const AMBER = "#d97706";
/** The modifier's usual top (it ranges about ×0.5–×1.5, rerolling every 30 s). */
const USUAL_MAX = 1.5;

const fmtMod = (m: number) => `×${m.toFixed(2)}`;

interface Props {
  catchValue: number;
  chefSpeed: number;
  /** Money multiplier applied when collecting (1 = none). */
  multiplier: number;
  /** Fish still queued with the chef right now. */
  backlog: number;
}

/** Compact, sticky summary: fishermen, income, the chef, and whether to grow the catch or the chef next. */
export function BalancePanel({ catchValue, chefSpeed, multiplier, backlog, count }: Props & { count: number }) {
  const busy = backlog > 0;
  // A queued chef is full, so income is chef speed until the queue runs out.
  const income = busy ? chefSpeed : Math.min(catchValue, chefSpeed);
  const max = Math.max(catchValue, chefSpeed);
  const chefLimited = catchValue > chefSpeed * (1 + BALANCE);
  const fishLimited = chefSpeed > catchValue * (1 + BALANCE);
  const next = chefModel ? nextUpgrade(chefModel, chefSpeed) : undefined;
  const catchUp = chefLimited && chefModel ? upgradesToReach(chefModel, chefSpeed, catchValue) : undefined;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <h2 className="text-base font-semibold">At a glance</h2>
        <dl className="grid w-full grid-cols-3 gap-x-3 sm:flex sm:w-auto sm:flex-wrap sm:justify-end sm:gap-x-6 sm:gap-y-2 sm:text-right">
          <GlanceStat label="Fishermen" value={count.toLocaleString()} />
          <GlanceStat
            label={busy ? "Income now" : "Income at ×1 fish value"}
            title="Income is whichever is lower: the value of the fish you catch, or what the chef can process. A chef with a backlog is always full."
            value={`${money(income)}/s`}
            extra={multiplier > 1 ? `${money(income * multiplier)}/s after ${multiplierLabel(multiplier)}` : undefined}
          />
          <GlanceStat label="Chef" value={busy ? clock(backlogSeconds(backlog, chefSpeed, catchValue)) : "Idle"} extra={busy ? "busy with backlog" : "no backlog"} />
        </dl>
      </div>

      <div className="space-y-1.5">
        <Bar label="Fish value" value={catchValue} max={max} limiting={fishLimited} />
        <Bar label="Chef can process" value={chefSpeed} max={max} limiting={chefLimited} />
      </div>

      <div
        className={`mt-3 rounded-xl px-3 py-2 text-sm ${chefLimited || fishLimited ? "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100" : "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"}`}
      >
        {chefLimited && catchUp && next ? (
          <>
            <b>Upgrade the chef.</b> {money(catchValue - chefSpeed)}/s of your catch goes unused, so hiring adds nothing for now. {catchUp.upgrades} upgrade
            {catchUp.upgrades === 1 ? "" : "s"} (about {money(catchUp.cost)}) would catch the chef up; the next adds {perSecond(next.gain, multiplier)} and pays for
            itself in {duration(next.cost / (next.gain * multiplier))}.
          </>
        ) : fishLimited ? (
          <>
            <b>Grow your catch.</b> The chef has {money(chefSpeed - catchValue)}/s (+{(((chefSpeed - catchValue) / catchValue) * 100).toFixed(0)}%) spare, so chef
            upgrades add nothing for now. Hire, take boats, or deliver at a high fish value modifier.
          </>
        ) : (
          <>
            <b>Balanced.</b> Catch and chef are within {BALANCE * 100}% of each other, so grow both.
            {next && ` The next chef upgrade adds up to ${perSecond(next.gain, multiplier)} for ${money(next.cost)}.`}
          </>
        )}
      </div>
    </section>
  );
}

function GlanceStat({ label, value, extra, title }: { label: string; value: string; extra?: string; title?: string }) {
  return (
    <div title={title}>
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-lg font-semibold leading-tight tabular-nums">{value}</dd>
      {extra && <dd className="text-xs text-slate-500 tabular-nums dark:text-slate-400">{extra}</dd>}
    </div>
  );
}

function Bar({ label, value, max, limiting }: { label: string; value: number; max: number; limiting: boolean }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_5rem] items-center gap-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)_5.5rem] sm:gap-3">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: limiting ? AMBER : TEAL }} />
      </div>
      <span className="text-right font-medium tabular-nums">{money(value)}/s</span>
    </div>
  );
}


interface DeliveryProps extends Props {
  /** Set the chef's backlog as of now (undefined clears it). */
  setBacklog: (fish: number | undefined) => void;
}

/** The chef's queue, and when it's worth handing fish over. */
export function DeliveryPanel({ catchValue, chefSpeed, multiplier, backlog, setBacklog }: DeliveryProps) {
  const [held, setHeld] = useState<number>();
  const [modifier, setModifier] = useState<number | undefined>(1);
  const be = breakEvenModifier(catchValue, chefSpeed);
  const strategy = deliveryStrategy(catchValue, chefSpeed, USUAL_MAX);
  const m = modifier && modifier > 0 ? modifier : 1;
  const receives = (held ?? 0) * m;
  const withMult = (v: number) => (multiplier > 1 ? ` (${money(v * multiplier)} after ${multiplierLabel(multiplier)})` : "");

  return (
    <Card
      title="Delivering fish"
      subtitle="The chef queues the fish you hand over and works through them at chef speed. Each fish is multiplied by the Fish Value modifier when you hand it over."
    >
      <div
        className={`mb-4 rounded-xl px-4 py-3 text-sm ${strategy === "chef" ? "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100" : "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"}`}
      >
        {strategy === "picky" ? (
          <>
            <b>Deliver only at your highest rolls.</b> Your chef can take up to {fmtMod(be)} of your catch, more than the modifier usually reaches, so it never runs
            short in the long run and held fish lose nothing by waiting. A ×1.5 delivery is worth 50% more than a ×1.0 one.
          </>
        ) : strategy === "threshold" ? (
          <>
            <b>Deliver at {fmtMod(be)} or higher.</b> At that modifier your catch fills the chef ({money(chefSpeed)}/s), so waiting for a higher roll only grows the
            queue without raising income. Below it, hold your fish.
          </>
        ) : (
          <>
            <b>The modifier no longer changes your income.</b> Your catch outgrows the chef even at ×1, so the queue only grows and the chef is always full. Upgrade
            the chef to earn more.
          </>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Chef backlog</h3>
          <Field label="Fish waiting with the chef" hint="As shown in game. It counts down at chef speed from when you enter it.">
            <MoneyInput value={backlog > 0 ? backlog : undefined} onChange={setBacklog} label="Chef backlog" placeholder="e.g. 1.9b" />
          </Field>
          {backlog > 0 ? (
            <div className="mt-3 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-slate-600 dark:text-slate-300">Chef busy for</span>
                <span className="text-2xl font-semibold tabular-nums">{clock(backlogSeconds(backlog, chefSpeed, catchValue))}</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {money(backlog)} of fish still to collect{withMult(backlog)}, paid out at {money(chefSpeed)}/s.
              </p>
              <table className="w-full text-sm tabular-nums">
                <caption className="mb-1 text-left text-xs text-slate-500 dark:text-slate-400">If you keep delivering your whole catch at an average of…</caption>
                <tbody>
                  {[1, 1.25, 1.5].map((avg) => {
                    const t = backlogSeconds(backlog, chefSpeed, catchValue, avg);
                    return (
                      <tr key={avg} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-1">{fmtMod(avg)}</td>
                        <td className="py-1 text-right">{Number.isFinite(t) ? `lasts ${duration(t)}` : `grows by ${money(avg * catchValue - chefSpeed)}/s`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Empty: income is {money(Math.min(catchValue, chefSpeed))}/s at ×1, up to {money(Math.min(chefSpeed, USUAL_MAX * catchValue))}/s if you deliver at{" "}
              {fmtMod(USUAL_MAX)}.
            </p>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Hand over fish</h3>
          <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
            <Field label="Fish you're holding">
              <MoneyInput value={held} onChange={setHeld} label="Fish held" placeholder="e.g. 100m" />
            </Field>
            <Field label="Modifier now">
              <NumberInput value={modifier} onChange={setModifier} placeholder="1" label="Fish Value modifier now" suffix="×" />
            </Field>
          </div>
          {held ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                The chef receives <b className="text-slate-900 dark:text-slate-100">{money(receives)}</b>
                {withMult(receives)}: another {duration(receives / chefSpeed)} of work.
              </p>
              <Button
                variant="primary"
                onClick={() => {
                  setBacklog(backlog + receives);
                  setHeld(undefined);
                }}
              >
                I handed them over (+{money(receives)} to backlog)
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Enter what you're holding to see what the chef gets, and add it to the backlog when you hand it over.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
