import type { DailyLow } from "@baga/core";

/**
 * The link preview's small price chart: observed daily lows only (CLAUDE.md rule 2). A day without an observation
 * breaks the line, so a gap stays a gap; a lone day between gaps is a dot. No chart for fewer than two days or a flat price. The last `days` calendar days up to the
 * last observed day, x by calendar day, y from the lowest (bottom) to the highest (top) price shown.
 */
export interface Spark {
  /** Each unbroken run of consecutive days as SVG polyline points ("x,y x,y"). */
  lines: string[];
  /** Days observed alone (no neighbour on either side). */
  dots: { x: number; y: number }[];
  /** The last observed day. */
  last: { x: number; y: number };
}

const DAY = 86_400_000;
const dayNo = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);

export function sparkline(history: DailyLow[], width: number, height: number, days = 60, pad = 6): Spark | null {
  const sorted = [...history].sort((a, b) => a.day.localeCompare(b.day));
  if (sorted.length < 2) return null;
  const end = dayNo(sorted[sorted.length - 1]!.day);
  const start = end - (days - 1);
  const shown = sorted.filter((h) => dayNo(h.day) >= start);
  if (shown.length < 2) return null;
  const lo = Math.min(...shown.map((h) => h.price));
  const hi = Math.max(...shown.map((h) => h.price));
  // A price that never moved draws a flat line that reads as a divider; the verdict's «Цена стабильна» says it.
  if (hi === lo) return null;
  const first = Math.max(start, dayNo(shown[0]!.day));
  const span = Math.max(1, end - first);
  const x = (d: string) => +(pad + ((dayNo(d) - first) / span) * (width - 2 * pad)).toFixed(1);
  const y = (p: number) => +(pad + ((hi - p) / (hi - lo)) * (height - 2 * pad)).toFixed(1);

  const runs: DailyLow[][] = [];
  for (const h of shown) {
    const run = runs[runs.length - 1];
    const prev = run?.[run.length - 1];
    if (run && prev && dayNo(h.day) - dayNo(prev.day) === 1) run.push(h);
    else runs.push([h]);
  }
  const lastDay = shown[shown.length - 1]!;
  return {
    lines: runs.filter((r) => r.length > 1).map((r) => r.map((h) => `${x(h.day)},${y(h.price)}`).join(" ")),
    dots: runs.filter((r) => r.length === 1).map(([h]) => ({ x: x(h!.day), y: y(h!.price) })),
    last: { x: x(lastDay.day), y: y(lastDay.price) },
  };
}
