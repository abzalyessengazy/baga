"use client";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge, shortTitle } from "@baga/core";
import type { Market } from "@baga/db";
import { Link } from "@/i18n/navigation";
import { loadMarket } from "@/lib/market";
import { dayMonth, type DatesT } from "@/lib/dayMonth";

type L = "ru" | "kk";
type Drop = { externalId: string; title: string; titleKk: string | null; imageUrl: string | null; from: number; to: number; pct: number; at: string };
type Item = { externalId: string; title: string; titleKk: string | null; imageUrl: string | null; price: number | null; at: string };
type Moves = { drops: Drop[]; rises: Drop[] };
type Stats = {
  products: number; sellers: number; shiftDay: string | null; shiftRun?: { startedAt: string; finishedAt: string } | null; checks: number; changes: number; drops: number; rises: number; alertsSent: number; watchers: number;
  lastRun: { startedAt: string; finishedAt: string } | null;
  days: { day: string; checks: number; drops: number }[];
  moves: { day: Moves; week: Moves };
  mostTracked: Item[];
  newest: Item[];
};

const dropTitle = (d: { title: string; titleKk: string | null }, locale: L) => shortTitle((locale === "kk" && d.titleKk) || d.title);

/** A product's picture in a list row; an empty square keeps the rows aligned when there is none. */
function Thumb({ src }: { src: string | null }) {
  return src ? <img className="z-thumb" src={src} alt="" width={32} height={32} loading="lazy" /> : <span className="z-thumb" aria-hidden />;
}

// Each slip shows only the rows that fit it whole; "Смотреть все →" opens the full list in the catalog
// (/explore). One-line rows: 5, two-line rows: 4, three-line rows (categories): 3.
const ROWS = 5;
const ROWS_TWO = 4;
const ROWS_THREE = 3;

/* 2. Price moves (docs/STATS.md rules D and W): biggest drops or rises in percent, one line per product, the top line inked. */
function MovesSlip({ moves, locale }: { moves: Stats["moves"]; locale: L }) {
  const t = useTranslations("home");
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const go = useInView(ref, { once: true, amount: 0.4 }) || !!reduce;
  const [dir, setDir] = useState<keyof Moves>("drops");
  const [period, setPeriod] = useState<keyof Stats["moves"]>("day");
  const rows = moves[period][dir].slice(0, ROWS_TWO);
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
          transition={{ type: "spring", stiffness: 300, damping: 30, delay: Math.min(i, ROWS) * 0.1 }}>
          <Link href={`/p/${d.externalId}`} className={`seller-row z-drop z-has-thumb${i === 0 ? " is-best" : ""}${dir === "rises" ? " is-rise" : ""}`}>
            <Thumb src={d.imageUrl} />
            <span className="name">{dropTitle(d, locale)}<span className="z-sub">{formatTenge(d.from, locale)} → {formatTenge(d.to, locale)}</span></span>
            <span className="p">{d.pct > 0 ? "+" : "−"}{Math.abs(d.pct)}%</span>
          </Link>
        </motion.div>
      ))}
      <div className="z-foot"><Link href={`/explore?list=${dir}`} className="z-all">{t("explore")} →</Link></div>
    </div>
  );
}

/* Plain product lists: most tracked, and newly added to the catalog. */
function ListSlip({ items, locale, dated, more }: { items: Item[]; locale: L; dated?: boolean; more?: string }) {
  const t = useTranslations("home");
  const td = useTranslations("dates") as unknown as DatesT;
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const go = useInView(ref, { once: true, amount: 0.4 }) || !!reduce;
  return (
    <div className="slip-screen" ref={ref}>
      {items.slice(0, ROWS).map((d, i) => (
        <motion.div key={d.externalId} initial={reduce ? false : { opacity: 0, y: 10 }} animate={go ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.3, delay: Math.min(i, ROWS) * 0.1 }}>
          <Link href={`/p/${d.externalId}`} className="seller-row z-drop z-has-thumb">
            <Thumb src={d.imageUrl} />
            <span className="name">{dated && <span className="z-date">{dayMonth(d.at, td)}</span>}{dropTitle(d, locale)}</span>
            <span className="p">{d.price !== null ? formatTenge(d.price, locale) : "—"}</span>
          </Link>
        </motion.div>
      ))}
      {more && <div className="z-foot"><Link href={more} className="z-all">{t("explore")} →</Link></div>}
    </div>
  );
}

/* Seller spread: the same product, the cheapest and the dearest seller of its latest check. */
function SpreadSlip({ rows, locale }: { rows: Market["spread"]["top"]; locale: L }) {
  const t = useTranslations("home");
  return (
    <div className="slip-screen">
      {rows.slice(0, ROWS_TWO).map((s) => (
        <Link key={s.externalId} href={`/p/${s.externalId}`} className="seller-row z-drop z-spread z-gap z-has-thumb">
          <Thumb src={s.imageUrl} />
          <span className="name">{dropTitle(s, locale)}<span className="z-sub">{formatTenge(s.lo, locale)} – {formatTenge(s.hi, locale)}</span></span>
          <span className="p">+{formatTenge(s.hi - s.lo, locale)}</span>
        </Link>
      ))}
      <div className="z-foot"><Link href="/explore?list=spread" className="z-all">{t("explore")} →</Link></div>
    </div>
  );
}

/* 3. The biggest drop: the old price, the new one, and a stamp with the difference. */
function BestSlip({ d, locale }: { d: Drop; locale: L }) {
  const td = useTranslations("dates") as unknown as DatesT;
  const t = useTranslations("home");
  const ref = useRef<HTMLAnchorElement>(null);
  const reduce = useReducedMotion();
  const go = useInView(ref, { once: true, amount: 0.4 }) || !!reduce;
  return (
    <Link href={`/p/${d.externalId}`} className="slip-screen z-best" ref={ref}>
      <div className="z-best-head">
        {d.imageUrl ? <img className="z-thumb z-best-img" src={d.imageUrl} alt="" width={48} height={48} loading="lazy" /> : <span className="z-thumb z-best-img" aria-hidden />}
        <div className="z-best-title">{dropTitle(d, locale)}</div>
      </div>
      <div className="countdown-target"><span>{t("bestWas")}</span><s>{formatTenge(d.from, locale)}</s></div>
      <motion.div className="countdown-price" initial={reduce ? false : { opacity: 0.3, y: -6 }} animate={go ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.3 }}>
        {formatTenge(d.to, locale)}
      </motion.div>
      <div className="mail-line">✓ {dayMonth(d.at, td)} · Kaspi</div>
      <motion.div className="stamp countdown-stamp" initial={reduce ? false : { scale: 1.8, opacity: 0, rotate: -12 }}
        animate={go ? { scale: 1, opacity: 0.92, rotate: -5 } : {}} transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.9 }}>
        −{formatTenge(d.from - d.to, locale)}
      </motion.div>
    </Link>
  );
}

/**
 * The home page lists: real platform numbers from /api/stats, drawn on the receipt slips. The totals live once, on the
 * "Kaspi today" receipt at the top (MarketReceipt); the method notes live on /explore, not here. Nothing is shown
 * until there is a finished collector run, and never sample numbers in its place.
 */
export function ZReport() {
  const t = useTranslations("home");
  const locale = useLocale() as L;
  const [s, setS] = useState<Stats | null>(null);
  const [m, setM] = useState<Market | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/stats").then((r) => (r.ok ? r.json() : null)).then((j: Stats | null) => { if (live) setS(j); }).catch(() => {});
    loadMarket().then((x) => { if (live) setM(x); });
    return () => { live = false; };
  }, []);
  if (!s?.lastRun || !s.days.length) return null;
  const best = s.moves.week.drops[0];
  const slips = [
    { title: t("movesTitle"), el: <MovesSlip moves={s.moves} locale={locale} /> },
    ...(m?.spread.top.length ? [{ title: t("spreadTitle"), el: <SpreadSlip rows={m.spread.top} locale={locale} /> }] : []),
    ...(best ? [{ title: t("bestTitle"), el: <BestSlip d={best} locale={locale} /> }] : []),
    ...(s.mostTracked.length ? [{ title: t("trackedTitle"), el: <ListSlip items={s.mostTracked} locale={locale} /> }] : []),
    ...(s.newest.length ? [{ title: t("newTitle"), el: <ListSlip items={s.newest} locale={locale} dated more="/explore?list=all&sort=new" /> }] : []),
  ];
  return (
    <section className="wrap section">
      <h2 className="section-title">{t("zTitle")}</h2>
      <div className="z-slips" data-n={slips.length}>
        {slips.map((x) => (
          <article key={x.title} className="slip">
            <div className="slip-caption"><h3>{x.title}</h3></div>
            {x.el}
          </article>
        ))}
      </div>
    </section>
  );
}
