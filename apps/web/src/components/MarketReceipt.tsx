"use client";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge, shortTitle } from "@baga/core";
import type { Market } from "@baga/db";
import { Link } from "@/i18n/navigation";
import { loadMarket } from "@/lib/market";
import { Wordmark } from "./Wordmark";

type L = "ru" | "kk";
const count = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
const ddmm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
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
  const has = !!m?.day && m.checked > 0;
  const spread = m?.spread;
  return (
    <div className="printer market-printer" ref={ref}>
      <div className="printer-slot" aria-hidden />
      <div className="printer-mouth">
        <motion.div initial={reduce ? false : { y: "-101%" }} animate={seen || reduce ? { y: 0 } : {}} transition={{ duration: 1.6, ease: printerEase }}>
          <section className="receipt market" aria-label={t("title")}>
            <div className="market-head">
              <span className="market-brand"><Wordmark /></span>
              <span className="market-day">{t("head")}{has && ` · ${ddmm(m!.day!)}`}</span>
            </div>
            <hr className="rule" />
            {!has && <p className="market-empty">{t("empty")}</p>}
            {has && (
              <>
                <dl className="market-cells">
                  <div><dt>{t("checked")}</dt><dd>{count(m!.checked)}</dd></div>
                  <div><dt>↓ {t("down")}</dt><dd>{count(m!.down)}</dd></div>
                  <div><dt>↑ {t("up")}</dt><dd>{count(m!.up)}</dd></div>
                </dl>
                <p className="market-note">{t("compared", { count: m!.compared })}</p>
                {m!.newLows > 0 && <p className="market-note is-ink">{t("newLows", { count: m!.newLows, days: 7 })}</p>}
              </>
            )}
            {has && spread && spread.products > 0 && spread.medianPct !== null && (
              <>
                <hr className="rule" />
                <div className="receipt-caption">{t("spreadCaption")}</div>
                <div className="market-big">
                  <span className="market-big-n">{spread.medianPct}%</span>
                  <span className="market-big-k">{t("spreadMedian")}</span>
                </div>
                <p className="market-note">{t("spreadMany", { over: spread.over25, count: spread.products })}</p>
                <div className="market-rows">
                  {spread.top.slice(0, 3).map((s) => (
                    <Link key={s.externalId} href={`/p/${s.externalId}`} className="seller-row z-drop z-spread">
                      <span className="name">{name(s, locale)}<span className="z-sub">{f(s.lo)} – {f(s.hi)}</span></span>
                      <span className="p">+{f(s.hi - s.lo)}</span>
                    </Link>
                  ))}
                </div>
              </>
            )}
            {has && m!.deals.length > 0 && (
              <>
                <hr className="rule" />
                <div className="receipt-caption">{t("deals")}</div>
                <div className="market-rows">
                  {m!.deals.slice(0, 3).map((d, i) => (
                    <Link key={d.externalId} href={`/p/${d.externalId}`} className={`seller-row z-drop z-spread${i === 0 ? " is-best" : ""}`}>
                      <span className="name">{name(d, locale)}<span className="z-sub">{f(d.was)} → {f(d.now)}</span></span>
                      <span className="p">{d.pct}%</span>
                    </Link>
                  ))}
                </div>
              </>
            )}
            <hr className="rule" />
            <p className="market-cta">{t("cta")}</p>
            {has && <Link href="/drops" className="z-all">{t("allMoves")} →</Link>}
          </section>
        </motion.div>
      </div>
    </div>
  );
}
