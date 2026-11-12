"use client";
import { CountChip } from "@/components/SellerChips";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Market } from "@baga/db";
import { Link } from "@/i18n/navigation";
import { cachedMarket, loadMarket } from "@/lib/market";
import { Wordmark } from "./Wordmark";
import { StatIcon } from "./StatIcon";
import { PickSlider } from "./PickSlider";
import { dayMonth, type DatesT } from "@/lib/dayMonth";

const count = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
/** Calendar days from the first observed day to the shown day (the live day included), both included. */
const historyDays = (first: string | null, last: string) =>
  first ? Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1 : 0;

/** "12:35", Almaty time. */
const almatyTime = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Almaty" }).format(new Date(iso));

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
  const reduce = useReducedMotion();
  // Back from a product page the numbers are already here: drawn at once, without printing again.
  const [m, setM] = useState<Market | null | undefined>(cachedMarket);
  const [still] = useState(() => cachedMarket() !== undefined);
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
  const has = !!m && m.catalog.products > 0;
  const spread = m?.spread;
  return (
    <div className="printer market-printer" ref={ref}>
      <div className="printer-slot" aria-hidden />
      <div className="printer-mouth">
        <motion.div initial={reduce || still ? false : { y: "-101%" }} animate={seen || reduce ? { y: 0 } : {}} transition={{ duration: 1.6, ease: printerEase }}>
          <section className="receipt market" aria-label={t("title")}>
            <div className="market-head">
              <span className="market-brand"><Wordmark /></span>
              <span className="market-day">{t("head")}</span>
            </div>
            <hr className="rule" />
            {!has && <p className="market-empty">{t("empty")}</p>}
            {has && (
              <>
                {/* The whole catalog, then the latest complete day in one line (docs/STATS.md). Numbers with one- or
                    two-word labels only: the method lives on /explore and /shops, not here. */}
                <dl className="mk-stats">
                  <div><dt><StatIcon name="box" />{t("products")}</dt><dd>{count(m!.catalog.products)}</dd></div>
                  <div><dt><StatIcon name="store" />{t("sellers")}</dt><dd>{count(m!.catalog.sellers)}</dd></div>
                  <div><dt><StatIcon name="calendar" />{t("days")}</dt><dd>{count(historyDays(m!.catalog.firstDay, m!.day ?? m!.catalog.firstDay ?? ""))}</dd></div>
                </dl>
                {m!.day && (
                  <p className="mk-line">
                    {/* The live day says it is still being checked; an earlier day says when today's check comes (12 Nov). */}
                    <span className="mk-when">{
                      m!.live && m!.asOf ? t("dayLive", { day: dayMonth(m!.day!, td), time: almatyTime(m!.asOf) })
                      : m!.todayCheck === "later" ? t("dayEarlier", { day: dayMonth(m!.day!, td) })
                      : m!.todayCheck === "running" ? t("dayRunning", { day: dayMonth(m!.day!, td) })
                      : dayMonth(m!.day!, td)}</span>
                    <span className="mk-pair"><span className="mk-n is-down">↓ {count(m!.down)}</span> {t("dayDown")}</span>
                    <span className="mk-pair"><span className="mk-n is-up">↑ {count(m!.up)}</span> {t("dayUp")}</span>
                  </p>
                )}
                {/* Shops by Kaspi's rating, the seller table's chips and labels (packages/core/src/sellers.ts). */}
                {m!.shops && m!.catalog.sellers > 0 && (
                  <Link href="/shops" className="mk-line mk-shops" aria-label={t("shopsAll")}>
                    <span className="mk-when">{t("shopsTitle")}</span>
                    <span className="mk-pair"><CountChip kind="high" n={m!.shops.high} label={t("shopsHigh")} /> {t("shopsHigh")}</span>
                    <span className="mk-pair"><CountChip kind="mixed" n={m!.shops.mixed + m!.shops.low} label={t("shopsMixed")} /> {t("shopsMixed")}</span>
                    <span className="mk-pair"><CountChip kind="few" n={m!.shops.few + m!.shops.none} label={t("shopsUnknown")} /> {t("shopsUnknown")}</span>
                    <span className="mk-go" aria-hidden>→</span>
                  </Link>
                )}
              </>
            )}
            {has && spread && spread.products > 0 && spread.medianPct !== null && (
              <Link href="/explore?list=spread" className="mk-spread">
                <span className="mk-big">{spread.medianPct}%</span>
                <span className="mk-big-k">{t("spreadMedian")}</span>
              </Link>
            )}
            {has && <PickSlider picks={m!.picks ?? (m!.pick ? [m!.pick] : [])} />}
          </section>
        </motion.div>
      </div>
    </div>
  );
}
