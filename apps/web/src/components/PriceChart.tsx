"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge, moveDirection, type DailyLow } from "@baga/core";

const DAY = 86_400_000;
type Range = 30 | 90 | 0;

/**
 * Bar chart of observed daily lows: one slot per calendar day, one bar per observed day. A day without a check stays
 * an empty slot (a tick on the baseline); nothing is interpolated. A bar is violet when the low fell by MOVE_MIN_PCT
 * or more against the previous observed day, red when it rose. Tapping or hovering a bar shows its date and price.
 */
export function PriceChart({ history }: { history: DailyLow[] }) {
  const t = useTranslations("product");
  const locale = useLocale() as "ru" | "kk";
  const [range, setRange] = useState<Range>(90);
  const [picked, setPicked] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => { if (e) setW(Math.max(280, Math.round(e.contentRect.width))); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const data = useMemo(() => {
    if (!range || history.length === 0) return history;
    const last = Date.parse(history[history.length - 1]!.day);
    return history.filter((d) => last - Date.parse(d.day) < range * DAY);
  }, [history, range]);

  if (history.length < 2) return <div className="empty-history">{t("noHistory")}</div>;

  const H = W < 520 ? 190 : 230, padL = 0, padR = W < 520 ? 78 : 96, padT = 12, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const first = Date.parse(data[0]!.day);
  const slots = Math.round((Date.parse(data[data.length - 1]!.day) - first) / DAY) + 1;
  const slotW = plotW / slots;
  const barW = Math.max(1.5, Math.min(slotW * 0.72, 36));
  const prices = data.map((d) => d.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const span = Math.max(hi - lo, hi * 0.02);
  // Bars stand on a floor below the lowest price (not on zero), so small moves stay visible; the dashed lines
  // with their prices give the scale.
  const floor = lo - span * 0.6, top = hi + span * 0.08;
  const Y = (p: number) => padT + (1 - (p - floor) / (top - floor)) * plotH;
  const base = padT + plotH;
  const slotOf = (d: DailyLow) => Math.round((Date.parse(d.day) - first) / DAY);
  const cx = (slot: number) => padL + slotW * (slot + 0.5);
  const observed = new Set(data.map(slotOf));
  const hasGap = observed.size < slots;
  const selIdx = Math.max(0, data.findIndex((d) => d.day === picked));
  const sel = data[picked && data.some((d) => d.day === picked) ? selIdx : data.length - 1]!;
  const fmtDay = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}`;
  const mono = { fontFamily: "var(--font-receipt)", fontSize: 12 } as const;
  const move = (step: number) => {
    const i = data.findIndex((d) => d.day === sel.day);
    const next = data[Math.min(data.length - 1, Math.max(0, i + step))];
    if (next) setPicked(next.day);
  };

  return (
    <div className="chart">
      <div className="chart-tabs" role="group" aria-label={t("historyTitle")}>
        {([30, 90, 0] as Range[]).map((r) => (
          <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
            {r === 30 ? t("range30") : r === 90 ? t("range90") : t("rangeAll")}
          </button>
        ))}
      </div>
      <p className="chart-readout" aria-live="polite">
        <span>{fmtDay(sel.day)}</span> <b>{formatTenge(sel.price, locale)}</b> <span>{t("dayLow")}</span>
      </p>
      <div ref={box}>
        <svg
          viewBox={`0 0 ${W} ${H}`} width={W} height={H} tabIndex={0}
          role="img" aria-label={`${t("historyTitle")}: ${formatTenge(lo, locale)} – ${formatTenge(hi, locale)}`}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") setPicked(null); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
            if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
          }}
        >
          <line x1={padL} x2={W - padR + 4} y1={Y(hi)} y2={Y(hi)} stroke="var(--rule)" strokeDasharray="2 4" />
          <line x1={padL} x2={W - padR + 4} y1={Y(lo)} y2={Y(lo)} stroke="var(--stamp)" strokeDasharray="2 4" />
          <line x1={padL} x2={W - padR} y1={base} y2={base} stroke="var(--rule)" />
          {hi !== lo && <text x={W - padR + 8} y={Y(hi) + 4} {...mono} fill="var(--ink-soft)">{formatTenge(hi, locale)}</text>}
          <text x={W - padR + 8} y={Y(lo) + (hi - lo > 0 && Y(lo) - Y(hi) < 16 ? 14 : 4)} {...mono} fill="var(--stamp)" fontWeight="700">{formatTenge(lo, locale)}</text>
          {Array.from({ length: slots }, (_, s) => s).filter((s) => !observed.has(s)).map((s) => (
            <line key={`g${s}`} x1={cx(s) - Math.min(barW, 6) / 2} x2={cx(s) + Math.min(barW, 6) / 2} y1={base - 1} y2={base - 1} stroke="var(--ink-soft)" strokeWidth="2" />
          ))}
          {data.map((d, i) => {
            const s = slotOf(d);
            const dir = i > 0 ? moveDirection(data[i - 1]!.price, d.price) : 0;
            const fill = dir < 0 ? "var(--stamp)" : dir > 0 ? "var(--stamp-red)" : "var(--ink)";
            const on = d.day === sel.day;
            return (
              <g key={d.day}>
                {on && <rect x={padL + slotW * s} y={padT} width={slotW} height={plotH} fill="var(--rule)" opacity="0.15" />}
                <rect x={cx(s) - barW / 2} y={Y(d.price)} width={barW} height={Math.max(1, base - Y(d.price))} fill={fill} opacity={on ? 1 : 0.82} />
                <rect
                  x={padL + slotW * s} y={padT} width={slotW} height={plotH + padB} fill="transparent"
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") setPicked(d.day); }}
                  onClick={() => setPicked(d.day)}
                >
                  <title>{`${fmtDay(d.day)} · ${formatTenge(d.price, locale)}`}</title>
                </rect>
              </g>
            );
          })}
          <text x={padL} y={H - 6} {...mono} fontSize={11} fill="var(--ink-soft)">{fmtDay(data[0]!.day)}</text>
          <text x={W - padR} y={H - 6} {...mono} fontSize={11} fill="var(--ink-soft)" textAnchor="end">{fmtDay(data[data.length - 1]!.day)}</text>
        </svg>
      </div>
      {hasGap && <p className="note">{t("gap")}</p>}
    </div>
  );
}
