"use client";
import { formatCount, SULPAK_PAUSED_UNTIL } from "@baga/core";
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
import { CountUp } from "./Motion";

const count = (n: number) => formatCount(n);
/** Sulpak is listed only while we check it (paused after its 403/429, the owner, 20 Nov). */
const sulpakOn = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date()) >= SULPAK_PAUSED_UNTIL;
/** «2,3 млн ₸» (one decimal, comma) with the unit set small so it fits its column; under a million the full sum. */
const millions = (n: number, mln: string) => n >= 1_000_000
  ? <>{(Math.floor(n / 100_000) / 10).toFixed(1).replace(".", ",").replace(",0", "")}<small className="mk-unit"> {mln}</small></>
  : <>{formatCount(n)}<small className="mk-unit"> ₸</small></>;
// Printer feed: the paper advances in small steps, like a thermal printer.
const printerEase = (t: number) => Math.round(t * 28) / 28;

/**
 * The home page receipt "Kaspi today" (DECISIONS.md, 2026-11-03 "Market today instead of the sample receipt"):
 * real numbers from the latest collector run, printed where the sample receipt used to be. Nothing until the
 * numbers arrive; without any (no database, or before the first run) a short receipt says so.
 */
export function MarketReceipt() {
  const t = useTranslations("market");
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
                {/* What people use BAĞA for first (the owner, 15 Nov), then the catalog in one small line (docs/STATS.md). */}
                <dl className="mk-stats">
                  <div><dt><StatIcon name="people" />{t("valPeople")}</dt><dd><CountUp value={m!.people} format={count} duration={1.2} /></dd></div>
                  <div><dt><StatIcon name="eye" />{t("valWatched")}</dt><dd><CountUp value={m!.watched?.products ?? 0} format={count} duration={1.2} /></dd></div>
                  <div><dt><StatIcon name="down" />{t("valWant")}</dt><dd>{millions(m!.watched?.want ?? 0, t("mln"))}</dd></div>
                  {/* What alerts already caught (the owner, 20 Nov): drops to people's own price, never shrinks when a tracking ends. */}
                  <div><dt><StatIcon name="check" />{t("valCaught")}</dt><dd className="is-caught">{millions(m!.caught?.amount ?? 0, t("mln"))}</dd></div>
                </dl>
                <p className="mk-catalog">{t("catalogLine", { products: m!.catalog.products, sellers: m!.catalog.sellers })}</p>
                {/* The other stores we compare with (the owner, 15 Nov): their name chips, never their logos (CLAUDE.md design). */}
                <p className="mk-stores">{t("compareWith")} <span className="store-chip is-halyk">Halyk Market</span> <span className="store-chip is-technodom">Technodom</span>{sulpakOn() && <> <span className="store-chip is-sulpak">Sulpak</span></>}</p>
                {/* Every product's latest check against the one before it (Rule L, docs/STATS.md; the owner, 15 Nov): not
                    one day's checks, so the arrows do not shrink on a day the collector checks fewer products. */}
                {m!.latest?.compared ? (
                  <p className="mk-line">
                    <span className="mk-when">{t("latestWhen")}</span>
                    <span className="mk-pair"><span className="mk-n is-down">↓ {count(m!.latest.down)}</span> {t("dayDown")}</span>
                    <span className="mk-pair"><span className="mk-n is-up">↑ {count(m!.latest.up)}</span> {t("dayUp")}</span>
                  </p>
                ) : null}
                {/* Shops by Kaspi's rating, the seller table's chips and labels (packages/core/src/sellers.ts). */}
                {m!.shops && m!.catalog.sellers > 0 && (
                  <Link href="/shops" className="mk-line mk-shops" aria-label={t("shopsAll")}>
                    <span className="mk-when">{t("shopsTitle")}</span>
                    {/* One row of chips, each with its words under it (the owner, 15 Nov: «fit in 1 line»). */}
                    <span className="mk-shop-row">
                      <span className="mk-shop"><CountChip kind="high" n={m!.shops.high} label={t("shopsHigh")} /><small>{t("shopsHigh")}</small></span>
                      <span className="mk-shop"><CountChip kind="mixed" n={m!.shops.mixed + m!.shops.low} label={t("shopsMixed")} /><small>{t("shopsMixed")}</small></span>
                      <span className="mk-shop"><CountChip kind="few" n={m!.shops.few + m!.shops.none} label={t("shopsUnknown")} /><small>{t("shopsUnknown")}</small></span>
                    </span>
                    <span className="mk-go" aria-hidden>→</span>
                  </Link>
                )}
              </>
            )}
            {has && <PickSlider picks={m!.picks ?? (m!.pick ? [m!.pick] : [])} />}
          </section>
        </motion.div>
      </div>
    </div>
  );
}
