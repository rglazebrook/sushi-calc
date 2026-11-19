import { chefModel, chefSpeedNow, nextUpgrade, speedAfter, upgradesFromSpeed } from "../chef.ts";
import { money } from "../format.ts";
import type { AppState } from "./store.ts";
import { Button, Card, Field, MoneyInput } from "./ui.tsx";

export function ChefPanel({ state, setState }: { state: AppState; setState: (f: (s: AppState) => AppState) => void }) {
  if (!chefModel) {
    return (
      <Card title="Chef">
        <p className="text-sm text-slate-500">Add upgrade data to src/data/chef.json to estimate chef upgrades.</p>
      </Card>
    );
  }
  const model = chefModel;
  const step = state.chefUpgrades;
  const speed = chefSpeedNow(model, state.chefSpeed, step);
  const next = speed !== undefined ? nextUpgrade(model, speed) : undefined;
  // Each upgrade moves the player one step up the ladder, and moves a typed-in speed along too.
  const upgrade = () =>
    setState((s) => ({
      ...s,
      chefUpgrades: s.chefUpgrades === undefined ? undefined : s.chefUpgrades + 1,
      chefSpeed: s.chefSpeed === undefined ? undefined : s.chefSpeed + nextUpgrade(model, s.chefSpeed).gain,
    }));
  // A speed read in game also finds the matching ladder step (when it's on the part of the ladder we know),
  // so clearing the box later keeps the exact speed rather than losing it.
  const type = (v: number | undefined) =>
    setState((s) => {
      if (v === undefined) return { ...s, chefSpeed: undefined };
      const onLadder = v >= model.lastSpeed - nextUpgrade(model, model.lastSpeed).gain / 2;
      return { ...s, chefSpeed: v, chefUpgrades: onLadder ? upgradesFromSpeed(model, v) : undefined };
    });

  const hint =
    speed === undefined
      ? "Enter the chef speed shown in game. After that, use the Upgrade button and the app keeps it exact."
      : state.chefSpeed === undefined
        ? "Worked out from your upgrades, more exactly than the game's rounded display. Type a speed only if it's off."
        : step !== undefined
          ? `Typed in. The game rounds speed to 0.1M; clear the box to use the exact value (${money(speedAfter(model, step))}/s).`
          : "Typed in. The game rounds speed to 0.1M, so upgrade costs can be ~2% off.";

  return (
    <Card title="Chef" subtitle="The chef turns fish into sushi at a set amount of fish value per second.">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Field label="Chef speed (fish value per second)" hint={hint}>
            <MoneyInput value={speed} onChange={type} label="Chef speed" placeholder="e.g. 2.5m" />
          </Field>
          <Button variant="primary" onClick={upgrade} disabled={!next}>
            {next ? `Upgrade chef (+${money(next.gain)}/s)` : "Upgrade chef"}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile label="Current speed" value={speed !== undefined ? `${money(speed)}/s` : "–"} />
          <Tile label="Next upgrade adds" value={next ? `+${money(next.gain)}/s` : "–"} />
          <Tile label="Next upgrade costs" value={next ? money(next.cost) : "–"} />
        </div>
      </div>
    </Card>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
