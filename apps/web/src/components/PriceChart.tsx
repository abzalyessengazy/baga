"use client";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge, type DailyLow } from "@baga/core";

const DAY = 86_400_000;
type Range = 30 | 90 | 0;

/** Step chart of observed daily lows. Missing days break the line; nothing is interpolated. */
export function PriceChart({ history }: { history: DailyLow[] }) {
  const t = useTranslations("product");
  const locale = useLocale() as "ru" | "kk";
  const [range, setRange] = useState<Range>(90);
  const data = useMemo(() => {
    if (!range || history.length === 0) return history;
    const last = Date.parse(history[history.length - 1]!.day);
    return history.filter((d) => last - Date.parse(d.day) < range * DAY);
  }, [history, range]);

  if (history.length < 2) return <div className="empty-history">{t("noHistory")}</div>;

  const W = 640, H = 200, padL = 8, padR = 92, padT = 14, padB = 26;
  const xs = data.map((d) => Date.parse(d.day));
  const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + DAY);
  const prices = data.map((d) => d.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const span = Math.max(hi - lo, hi * 0.02);
  const X = (ms: number) => padL + ((ms - x0) / (x1 - x0)) * (W - padL - padR);
  const Y = (p: number) => padT + (1 - (p - (lo - span * 0.1)) / (span * 1.2)) * (H - padT - padB);

  // Build step segments, breaking on gaps of more than one day.
  const segments: string[] = [];
  let seg = "";
  let hasGap = false;
  data.forEach((d, i) => {
    const ms = xs[i]!;
    if (i === 0 || ms - xs[i - 1]! > DAY * 1.5) {
      if (i > 0) hasGap = true;
      if (seg) segments.push(seg);
      seg = `M${X(ms)},${Y(d.price)}`;
    } else {
      seg += `H${X(ms)}V${Y(d.price)}`;
    }
    if (i === data.length - 1) seg += `H${X(ms + DAY * 0.6)}`;
  });
  if (seg) segments.push(seg);
  const minIdx = prices.indexOf(lo);
  const fmtDay = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}`;
  const last = data[data.length - 1]!;

  return (
    <div className="chart">
      <div className="chart-tabs" role="group" aria-label={t("historyTitle")}>
        {([30, 90, 0] as Range[]).map((r) => (
          <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
            {r === 30 ? t("range30") : r === 90 ? t("range90") : t("rangeAll")}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t("historyTitle")}: ${formatTenge(lo, locale)} – ${formatTenge(hi, locale)}`}>
        <line x1={padL} x2={W - padR} y1={Y(lo)} y2={Y(lo)} stroke="var(--stamp)" strokeDasharray="2 4" strokeWidth="1.2" />
        <text x={W - padR + 8} y={Y(lo) + 4} fontSize="12" fill="var(--stamp)" fontFamily="var(--font-receipt)" fontWeight="700">{formatTenge(lo, locale)}</text>
        {hi !== lo && <text x={W - padR + 8} y={Y(hi) + 4} fontSize="12" fill="var(--ink-soft)" fontFamily="var(--font-receipt)">{formatTenge(hi, locale)}</text>}
        {segments.map((d, i) => <path key={i} d={d} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />)}
        <circle cx={X(xs[minIdx]!)} cy={Y(lo)} r="4" fill="var(--stamp)" />
        <circle cx={X(Date.parse(last.day))} cy={Y(last.price)} r="4" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" />
        <text x={padL} y={H - 6} fontSize="11" fill="var(--ink-soft)" fontFamily="var(--font-receipt)">{fmtDay(data[0]!.day)}</text>
        <text x={W - padR} y={H - 6} fontSize="11" fill="var(--ink-soft)" fontFamily="var(--font-receipt)" textAnchor="end">{fmtDay(last.day)}</text>
      </svg>
      {hasGap && <p className="note">{t("gap")}</p>}
    </div>
  );
}
