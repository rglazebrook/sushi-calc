import { useEffect, useState, type ReactNode } from "react";
import { money, parseMoney } from "../format.ts";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums shadow-sm outline-none " +
  "focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-900";

/** Cash input that accepts "750k", "2.4m", "$1,000,000". */
export function MoneyInput(props: { value?: number; onChange: (v: number | undefined) => void; placeholder?: string; label?: string }) {
  const show = (v?: number) => (v === undefined ? "" : money(v).replace("$", ""));
  const [text, setText] = useState(show(props.value));
  const [bad, setBad] = useState(false);
  const [focused, setFocused] = useState(false);
  // Reformat from the outside only while the user is not typing.
  useEffect(() => {
    if (!focused) setText(show(props.value));
  }, [props.value, focused]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">$</span>
      <input
        aria-label={props.label}
        className={`${inputClass} pl-6 ${bad ? "border-rose-500" : ""}`}
        value={text}
        placeholder={props.placeholder ?? "e.g. 750k"}
        inputMode="decimal"
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value.trim() === "") {
            setBad(false);
            props.onChange(undefined);
            return;
          }
          try {
            props.onChange(parseMoney(e.target.value));
            setBad(false);
          } catch {
            setBad(true);
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setBad(false);
        }}
      />
    </div>
  );
}

export function NumberInput(props: { value?: number; onChange: (v: number | undefined) => void; placeholder?: string; label?: string; suffix?: string }) {
  return (
    <div className="relative">
      <input
        aria-label={props.label}
        type="number"
        className={`${inputClass} ${props.suffix ? "pr-7" : ""}`}
        value={props.value ?? ""}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
      {props.suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">{props.suffix}</span>
      )}
    </div>
  );
}

export function TextInput(props: { value: string; onChange: (v: string) => void; label?: string; className?: string }) {
  return <input aria-label={props.label} className={`${inputClass} ${props.className ?? ""}`} value={props.value} onChange={(e) => props.onChange(e.target.value)} />;
}

export function Card(props: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{props.title}</h2>
          {props.subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{props.subtitle}</p>}
        </div>
        {props.actions}
      </div>
      {props.children}
    </section>
  );
}

export function Field(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{props.label}</span>
      {props.children}
      {props.hint && <span className="mt-1 block text-xs text-slate-400">{props.hint}</span>}
    </label>
  );
}

export function Button(props: { onClick: () => void; children: ReactNode; variant?: "primary" | "ghost" | "danger"; title?: string; disabled?: boolean }) {
  const styles = {
    primary: "bg-teal-600 text-white hover:bg-teal-700",
    ghost: "border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800",
    danger: "text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950",
  }[props.variant ?? "ghost"];
  return (
    <button
      type="button"
      title={props.title}
      onClick={props.onClick}
      disabled={props.disabled}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
    >
      {props.children}
    </button>
  );
}

export function Stat(props: { label: string; value: ReactNode; tone?: "good" | "bad" }) {
  const tone = props.tone === "good" ? "text-emerald-600 dark:text-emerald-400" : props.tone === "bad" ? "text-rose-600 dark:text-rose-400" : "";
  return (
    <div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{props.label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone}`}>{props.value}</div>
    </div>
  );
}
