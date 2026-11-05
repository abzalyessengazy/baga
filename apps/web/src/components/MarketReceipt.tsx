"use client";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge, shortTitle } from "@baga/core";
import type { Market } from "@baga/db";
import { Link } from "@/i18n/navigation";
import { loadMarket } from "@/lib/market";
import { Wordmark } from "./Wordmark";
import { StatIcon } from "./StatIcon";
import { dayMonth, type DatesT } from "@/lib/dayMonth";

type L = "ru" | "kk";
const count = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
/** "today" / "yesterday" for a YYYY-MM-DD day, by the Almaty calendar; anything older is named by its date. */
function relativeDay(day: string): "today" | "yesterday" | "other" {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date());
  const yesterday = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10);
  return day === today ? "today" : day === yesterday ? "yesterday" : "other";
}
/** Calendar days from the first observed day to the latest complete shift, both included. */
const historyDays = (first: string | null, last: string) =>
  first ? Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1 : 0;
const name = (p: { title: string; titleKk: string | null }, locale: L) => shortTitle((locale === "kk" && p.titleKk) || p.title);

// Printer feed: the paper advances in small steps, like a thermal printer.
const printerEase = (t: number) => Math.round(t * 28) / 28;

/**
 * The home page receipt "Kaspi today" (DECISIONS.md, 2026-11-03 "Market today instead of the sample receipt"):
 * real numbers from the latest collector run, printed where the sample receipt used to be. Nothing until the
 * numbers arrive; without any (no database, or before the first run) a short receipt says so.
 */
export function MarketReceipt() {
  const t = useTranslations("market");
  const td = useTranslations("dates") as unknown as DatesT;
  const locale = useLocale() as L;
  const reduce = useReducedMotion();
  const [m, setM] = useState<Market | null | undefined>(undefined);
  // On a phone the receipt sits under the form: print it when it comes into view, not unseen.
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.15 });
  useEffect(() => {
    let live = true;
    loadMarket().then((x) => { if (live) setM(x); });
    return () => { live = false; };
  }, []);
  // The same outer element before and after loading, so useInView keeps watching it.
  if (m === undefined) return <div className="printer market-printer" ref={ref} aria-hidden><div className="printer-slot" /><div className="market-wait" /></div>;
  const f = (n: number) => formatTenge(n, locale);
  const has = !!m && m.catalog.products > 0;
  const spread = m?.spread;
  return (
    <div className="printer market-printer" ref={ref}>
      <div className="printer-slot" aria-hidden />
      <div className="printer-mouth">
        <motion.div initial={reduce ? false : { y: "-101%" }} animate={seen || reduce ? { y: 0 } : {}} transition={{ duration: 1.6, ease: printerEase }}>
          <section className="receipt market" aria-label={t("title")}>
            <div className="market-head">
              <span className="market-brand"><Wordmark /></span>
              <span className="market-day">{t("head")}</span>
            </div>
            <hr className="rule" />
            {!has && <p className="market-empty">{t("empty")}</p>}
            {has && (
              <>
                {/* The whole catalog first; the latest complete day is a line under it (docs/STATS.md). */}
                <dl className="mk-stats">
                  <div><dt><StatIcon name="box" />{t("products")}</dt><dd>{count(m!.catalog.products)}</dd></div>
                  <div><dt><StatIcon name="store" />{t("sellers")}</dt><dd>{count(m!.catalog.sellers)}</dd></div>
                  <div><dt><StatIcon name="calendar" />{t("days")}</dt><dd>{count(historyDays(m!.catalog.firstDay, m!.day ?? m!.catalog.firstDay ?? ""))}</dd></div>
                </dl>
                {m!.day && <p className="mk-day">
                  {t("dayLine", { when: relativeDay(m!.day!), date: dayMonth(m!.day!, td), count: m!.compared })}{" "}
                  <span className="mk-day-n is-down">↓ {count(m!.down)}</span> {t("down").toLowerCase()} ·{" "}
                  <span className="mk-day-n is-up">↑ {count(m!.up)}</span> {t("up").toLowerCase()}
                </p>}
                {m!.newLows > 0 && <p className="mk-note is-ink">{t("newLows", { count: m!.newLows, days: 7 })}</p>}
              </>
            )}
            {has && spread && spread.products > 0 && spread.medianPct !== null && (
              <div className="mk-spread">
                <p className="mk-label">{t("spreadCaption")}</p>
                <p className="mk-big">{spread.medianPct}%</p>
                <p className="mk-big-k">{t("spreadMedian")}</p>
                <p className="mk-strong">{t("spreadMany", { over: spread.over25, count: spread.products })}</p>
                <div className="mk-rows">
                  {spread.top.slice(0, 3).map((s) => (
                    <Link key={s.externalId} href={`/p/${s.externalId}`} className="mk-row">
                      {s.imageUrl ? <img className="z-thumb" src={s.imageUrl} alt="" width={32} height={32} loading="lazy" /> : <span className="z-thumb" aria-hidden />}
                      <span className="mk-row-name">{name(s, locale)}<span>{f(s.lo)} – {f(s.hi)}</span></span>
                      <span className="mk-row-v">+{f(s.hi - s.lo)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {has && m!.pick && (
              <Link href={`/p/${m!.pick.externalId}`} className="mk-pick">
                <p className="mk-label">{t("pickLabel")}</p>
                <div className="mk-pick-body">
                  {m!.pick.imageUrl ? <img src={m!.pick.imageUrl} alt="" width={72} height={72} loading="lazy" /> : <span className="mk-pick-img" aria-hidden />}
                  <div>
                    <p className="mk-pick-title">{name(m!.pick, locale)}</p>
                    <p className="mk-pick-price">{f(m!.pick.price)}</p>
                    <p className="mk-pick-why">{m!.pick.kind === "drop"
                      ? t("pickDrop", { pct: Math.abs(m!.pick.pct), ref: f(m!.pick.ref) })
                      : t("pickSeller", { pct: Math.abs(m!.pick.pct), ref: f(m!.pick.ref), sellers: m!.pick.sellers })}</p>
                  </div>
                </div>
                <span className="stamp mk-pick-stamp" aria-hidden>−{Math.abs(m!.pick.pct)}%</span>
              </Link>
            )}
          </section>
        </motion.div>
      </div>
    </div>
  );
}
