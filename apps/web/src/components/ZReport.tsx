"use client";
import { motion, useInView, useReducedMotion, animate } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge } from "@baga/core";
import { Link } from "@/i18n/navigation";

type L = "ru" | "kk";
type Drop = { externalId: string; title: string; titleKk: string | null; from: number; to: number; at: string };
type Item = { externalId: string; title: string; titleKk: string | null; price: number | null; at: string };
type Moves = { drops: Drop[]; rises: Drop[] };
type Stats = {
  products: number; sellers: number; checks: number; changes: number; drops: number; alertsSent: number; watchers: number;
  lastRun: { startedAt: string; finishedAt: string } | null;
  days: { day: string; checks: number; drops: number }[];
  moves: { day: Moves; week: Moves };
  mostTracked: Item[];
  newest: Item[];
};

// Small numbers are shown only once they mean something (DECISIONS.md, 2026-11-02 "Real numbers on the home page").
const SHOW_WATCHERS_FROM = 100;
const SHOW_ALERTS_FROM = 50;

const count = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
const almaty = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Almaty", ...opts }).format(new Date(iso));
const ddmm = (iso: string) => almaty(iso, { day: "2-digit", month: "2-digit" });
const hhmm = (iso: string) => almaty(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dropTitle = (d: { title: string; titleKk: string | null }, locale: L) => (locale === "kk" && d.titleKk) || d.title;

/** Counts up to `to` once `go` turns true; shows the final number right away when motion is reduced. */
function CountUp({ to, go }: { to: number; go: boolean }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? to : 0);
  useEffect(() => {
    if (!go) return;
    if (reduce) { setN(to); return; }
    const c = animate(0, to, { duration: 1.1, ease: "easeOut", onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [go, to, reduce]);
  return <>{count(n)}</>;
}

/* Totals: the Z-report head, stamped with the real time of the latest collector run. */
function Totals({ s }: { s: Stats & { lastRun: NonNullable<Stats["lastRun"]> } }) {
  const t = useTranslations("home");
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const go = useInView(ref, { once: true, amount: 0.4 }) || !!reduce;
  const cells: [string, number][] = [
    [t("zProducts"), s.products],
    [t("zChecks"), s.checks],
    [t("zChanges"), s.changes],
    [t("zDrops"), s.drops],
    [t("zSellers"), s.sellers],
    ...(s.alertsSent >= SHOW_ALERTS_FROM ? [[t("zAlerts"), s.alertsSent] as [string, number]] : []),
    ...(s.watchers >= SHOW_WATCHERS_FROM ? [[t("zWatchers"), s.watchers] as [string, number]] : []),
  ];
  const { startedAt, finishedAt } = s.lastRun;
  return (
    <div className="slip z-totals" ref={ref}>
      <div className="z-head">
        <span className="z-name">BAGA · {t("zHead")}</span>
        <span className="z-shift">{t("zShift", { date: ddmm(finishedAt), from: hhmm(startedAt), to: hhmm(finishedAt) })}</span>
      </div>
      <dl className="z-grid">
        {cells.map(([k, v]) => (
          <div key={k} className="z-cell"><dt>{k}</dt><dd><CountUp to={v} go={go} /></dd></div>
        ))}
      </dl>
      <motion.span className="stamp z-stamp" aria-hidden initial={reduce ? false : { scale: 1.8, opacity: 0, rotate: -16 }}
        animate={go ? { scale: 1, opacity: 0.92, rotate: -7 } : {}} transition={{ type: "spring", stiffness: 500, damping: 18, delay: 1.2 }}>
        {t("zStamp")}
      </motion.span>
    </div>
  );
}

/* 1. Checks per day: the price tape, printed one real day per line. */
function DaysSlip({ days }: { days: Stats["days"] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const go = useInView(ref, { once: true, amount: 0.4 }) || !!reduce;
  const rows = days.slice(-9);
  const max = Math.max(...rows.map((r) => r.checks));
  return (
    <div className="slip-screen" ref={ref}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
        {rows.map((r, i) => (
          <motion.div key={r.day} className={`tape-row${r.checks === max ? " is-min" : ""}`}
            initial={reduce ? false : { opacity: 0, y: 14 }} animate={go ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.35, delay: i * 0.12 }}>
            <span className="tape-date">{r.day.slice(8, 10)}.{r.day.slice(5, 7)}</span>
            <span className="tape-bar" style={{ width: `${12 + (r.checks / max) * 88}%` }} />
            <span className="tape-price">{count(r.checks)}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* 2. Price moves: biggest drops or rises of the latest day or the week, one line per product, the top line inked. */
function MovesSlip({ moves, locale }: { moves: Stats["moves"]; locale: L }) {
  const t = useTranslations("home");
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const go = useInView(ref, { once: true, amount: 0.4 }) || !!reduce;
  const [dir, setDir] = useState<keyof Moves>("drops");
  const [period, setPeriod] = useState<keyof Stats["moves"]>("day");
  const rows = moves[period][dir].slice(0, 4);
  const tab = <K extends string>(on: boolean, label: string, set: () => void, key: K) => (
    <button key={key} type="button" className={`z-tab${on ? " is-on" : ""}`} aria-pressed={on} onClick={set}>{label}</button>
  );
  return (
    <div className="slip-screen z-moves" ref={ref}>
      <div className="z-tabs">
        <span>{tab(dir === "drops", `↓ ${t("tabDrops")}`, () => setDir("drops"), "d")}{tab(dir === "rises", `↑ ${t("tabRises")}`, () => setDir("rises"), "r")}</span>
        <span>{tab(period === "day", t("periodDay"), () => setPeriod("day"), "day")}{tab(period === "week", t("periodWeek"), () => setPeriod("week"), "week")}</span>
      </div>
      {!rows.length && <p className="z-empty">{t("movesNone")}</p>}
      {rows.map((d, i) => (
        <motion.div key={`${dir}${period}${d.externalId}`} initial={reduce ? false : { opacity: 0, x: -10 }} animate={go ? { opacity: 1, x: 0 } : {}}
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: i * 0.1 }}>
          <Link href={`/p/${d.externalId}`} className={`seller-row z-drop${i === 0 ? " is-best" : ""}${dir === "rises" ? " is-rise" : ""}`}>
            <span className="name">{dropTitle(d, locale)}</span>
            <span className="p">{dir === "drops" ? "−" : "+"}{formatTenge(Math.abs(d.from - d.to), locale)}</span>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

/* 4–5. Plain product lists: most tracked, and newly added to the catalog. */
function ListSlip({ items, locale, dated }: { items: Item[]; locale: L; dated?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const go = useInView(ref, { once: true, amount: 0.4 }) || !!reduce;
  return (
    <div className="slip-screen" ref={ref}>
      {items.slice(0, 4).map((d, i) => (
        <motion.div key={d.externalId} initial={reduce ? false : { opacity: 0, y: 10 }} animate={go ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.3, delay: i * 0.1 }}>
          <Link href={`/p/${d.externalId}`} className="seller-row z-drop">
            <span className="name">{dated && <span className="z-date">{ddmm(d.at)}</span>}{dropTitle(d, locale)}</span>
            <span className="p">{d.price !== null ? formatTenge(d.price, locale) : "—"}</span>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

/* 3. The biggest drop: the old price, the new one, and a stamp with the difference. */
function BestSlip({ d, locale }: { d: Drop; locale: L }) {
  const t = useTranslations("home");
  const ref = useRef<HTMLAnchorElement>(null);
  const reduce = useReducedMotion();
  const go = useInView(ref, { once: true, amount: 0.4 }) || !!reduce;
  return (
    <Link href={`/p/${d.externalId}`} className="slip-screen z-best" ref={ref}>
      <div className="z-best-title">{dropTitle(d, locale)}</div>
      <div className="countdown-target"><span>{t("bestWas")}</span><s>{formatTenge(d.from, locale)}</s></div>
      <motion.div className="countdown-price" initial={reduce ? false : { opacity: 0.3, y: -6 }} animate={go ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.3 }}>
        {formatTenge(d.to, locale)}
      </motion.div>
      <div className="mail-line">✓ {ddmm(d.at)} · Kaspi</div>
      <motion.div className="stamp countdown-stamp" initial={reduce ? false : { scale: 1.8, opacity: 0, rotate: -12 }}
        animate={go ? { scale: 1, opacity: 0.92, rotate: -5 } : {}} transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.9 }}>
        −{formatTenge(d.from - d.to, locale)}
      </motion.div>
    </Link>
  );
}

/**
 * The home page Z-report: real platform numbers from /api/stats, drawn on the receipt slips. Nothing is shown
 * until there is a finished collector run, and never sample numbers in its place.
 */
export function ZReport() {
  const t = useTranslations("home");
  const locale = useLocale() as L;
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/stats").then((r) => (r.ok ? r.json() : null)).then((j: Stats | null) => { if (live) setS(j); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!s?.lastRun || !s.days.length) return null;
  const best = s.moves.week.drops[0];
  const slips = [
    { title: t("daysTitle"), text: t("daysText"), el: <DaysSlip days={s.days} /> },
    { title: t("movesTitle"), text: t("movesText"), el: <MovesSlip moves={s.moves} locale={locale} /> },
    ...(best ? [{ title: t("bestTitle"), text: t("bestText"), el: <BestSlip d={best} locale={locale} /> }] : []),
    ...(s.mostTracked.length ? [{ title: t("trackedTitle"), text: t("trackedText"), el: <ListSlip items={s.mostTracked} locale={locale} /> }] : []),
    ...(s.newest.length ? [{ title: t("newTitle"), text: t("newText"), el: <ListSlip items={s.newest} locale={locale} dated /> }] : []),
  ];
  return (
    <section className="wrap section">
      <h2 className="section-title">{t("zTitle")}</h2>
      <p className="section-note">{t("zNote")}</p>
      <Totals s={{ ...s, lastRun: s.lastRun }} />
      <div className="highlights">
        {slips.map((x) => (
          <article key={x.title} className="slip">
            {x.el}
            <div className="slip-caption"><h3>{x.title}</h3><p>{x.text}</p></div>
          </article>
        ))}
      </div>
    </section>
  );
}
