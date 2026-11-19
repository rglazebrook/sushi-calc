/** Parse "750k", "1.2m", "3b", "$1,000,000". */
export function parseMoney(text: string): number {
  const m = /^\$?([\d,.]+)\s*([kmbt]?)$/i.exec(text.trim());
  if (!m) throw new Error(`Not a cash amount: ${text}`);
  const scale = { "": 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[m[2]!.toLowerCase()]!;
  return Number(m[1]!.replace(/,/g, "")) * scale;
}

export function money(n: number): string {
  if (!Number.isFinite(n)) return "never";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  for (const [scale, suffix] of [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]] as const) {
    if (a >= scale) return `${sign}$${(a / scale).toFixed(a / scale >= 100 ? 0 : 2)}${suffix}`;
  }
  return `${sign}$${a.toFixed(a < 10 ? 2 : 0)}`;
}

export function duration(s: number): string {
  if (!Number.isFinite(s)) return "never";
  if (s < 60) return `${s.toFixed(0)}s`;
  if (s < 3600) return `${(s / 60).toFixed(1)}m`;
  if (s < 2 * 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

export const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

/**
 * Half the rounding step of a value as the game displays it. The game shows one
 * decimal of its K/M/B/T unit ("234.8K", "3.7M") and whole numbers below 1,000,
 * so 59800 → ±50 and 2000000 ("2.0M") → ±50,000.
 */
export function roundingHalfWidth(v: number): number {
  const a = Math.abs(v);
  if (a < 1000) return 0.5;
  const unit = 1000 ** Math.floor(Math.log10(a) / 3);
  return unit * 0.05;
}

/** "×4", "×1.5". */
export function multiplierLabel(m: number): string {
  return `×${Number(m.toFixed(2))}`;
}

/**
 * "$1.63M/s ($6.52M/s after ×4)". A money multiplier (bought with Robux) doesn't
 * change the amounts shown in game, only what you get when you collect.
 */
export function perSecond(v: number, multiplier = 1): string {
  const base = `${money(v)}/s`;
  return multiplier > 1 ? `${base} (${money(v * multiplier)}/s after ${multiplierLabel(multiplier)})` : base;
}

/** Countdown style: "11:19", "1:05:00". */
export function clock(s: number): string {
  if (!Number.isFinite(s)) return "∞";
  const t = Math.max(0, Math.ceil(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
