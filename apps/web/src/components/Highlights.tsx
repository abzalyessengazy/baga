"use client";
import { motion, useInView, useReducedMotion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge } from "@baga/core";

type L = "ru" | "kk";

/** Runs `tick` on an interval only while the element is on screen and motion is allowed. */
function useLoop(ref: React.RefObject<Element | null>, ms: number, tick: () => void) {
  const inView = useInView(ref, { amount: 0.4 });
  const reduce = useReducedMotion();
  const saved = useRef(tick);
  saved.current = tick;
  useEffect(() => {
    if (!inView || reduce) return;
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [inView, reduce, ms]);
}

/* 1. Price tape: a thermal tape printing one daily low per line. */
const TAPE = [742990, 739990, 739990, 731990, 734990, 729990, 719990, 724990, 714990, 709990, 712990, 699990, 704990, 689990, 694990, 699990, 709990, 714990, 704990, 699990];
function dayLabel(i: number) {
  const d = new Date(Date.UTC(2026, 8, 20 + i));
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function TapeSlip({ locale }: { locale: L }) {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(9);
  useLoop(ref, 1100, () => setN((v) => (v >= TAPE.length ? 9 : v + 1)));
  const rows = TAPE.slice(Math.max(0, n - 9), n).map((price, k) => ({ price, i: Math.max(0, n - 9) + k }));
  const min = Math.min(...rows.map((r) => r.price));
  const hi = 745000, lo = 685000;
  return (
    <div className="slip-screen" ref={ref} aria-hidden>
      <div className="tape-fade" />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
        <AnimatePresence initial={false}>
          {rows.map((r) => (
            <motion.div layout key={r.i} className={`tape-row${r.price === min ? " is-min" : ""}`}
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
              <span className="tape-date">{dayLabel(r.i)}</span>
              <span className="tape-bar" style={{ width: `${18 + ((r.price - lo) / (hi - lo)) * 82}%` }} />
              <span className="tape-price">{formatTenge(r.price, locale).replace(/ ₸$/, "")}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* 2. Sellers: prices change, the list re-sorts, the cheapest line is inked. */
const START = [
  { id: "a", name: "Mobile City", rate: 4.9, price: 704500 },
  { id: "b", name: "Техно Алем", rate: 4.7, price: 699990 },
  { id: "c", name: "Gadget Point", rate: 4.8, price: 712000 },
  { id: "d", name: "Smart Store KZ", rate: 4.6, price: 718990 },
  { id: "e", name: "Digital Dala", rate: 5.0, price: 709990 },
  { id: "f", name: "iMarket", rate: 4.5, price: 724990 },
];
function SellersSlip({ locale }: { locale: L }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sellers, setSellers] = useState(START);
  const step = useRef(0);
  useLoop(ref, 1700, () => {
    step.current++;
    setSellers((prev) => prev.map((s, i) => (i === step.current % prev.length ? { ...s, price: s.price + (step.current % 2 ? -9000 : 7000) } : s)));
  });
  const sorted = [...sellers].sort((a, b) => a.price - b.price);
  return (
    <div className="slip-screen" ref={ref} aria-hidden>
      {sorted.map((s, i) => (
        <motion.div layout key={s.id} className={`seller-row${i === 0 ? " is-best" : ""}`} transition={{ type: "spring", stiffness: 300, damping: 30 }}>
          <span className="name">{s.name}<span className="rate">★{s.rate.toFixed(1)}</span></span>
          <span className="p">{formatTenge(s.price, locale)}</span>
        </motion.div>
      ))}
    </div>
  );
}

/* 3. Coupon: today's price walks down to the target, the stamp lands, the email goes out. */
const WALK = [735990, 729990, 719990, 709990, 699990, 689990, 679990];
const TARGET = 679990;
function CountdownSlip({ locale }: { locale: L }) {
  const t = useTranslations("home");
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [k, setK] = useState(0);
  useLoop(ref, 900, () => setK((v) => (v >= WALK.length + 3 ? 0 : v + 1)));
  const idx = reduce ? WALK.length - 1 : Math.min(k, WALK.length - 1);
  const price = WALK[idx]!;
  const reached = price <= TARGET;
  const progress = (WALK[0]! - price) / (WALK[0]! - TARGET);
  return (
    <div className="slip-screen" ref={ref} aria-hidden>
      <div className="countdown-target"><span>{t("target")}</span><span>{formatTenge(TARGET, locale)}</span></div>
      <motion.div key={price} className="countdown-price" initial={{ opacity: 0.4, y: -6 }} animate={{ opacity: 1, y: 0 }}>
        {formatTenge(price, locale)}
      </motion.div>
      <div className="meter"><motion.div animate={{ width: `${Math.max(4, progress * 100)}%` }} transition={{ duration: 0.5 }} /></div>
      <AnimatePresence>
        {reached && (
          <motion.div className="stamp countdown-stamp" initial={{ scale: 1.8, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 0.92, rotate: -5 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
            {t("reached")}
          </motion.div>
        )}
      </AnimatePresence>
      {reached && <motion.div className="mail-line" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>✉ {t("mailSent")}</motion.div>}
    </div>
  );
}

export function Highlights() {
  const t = useTranslations("home");
  const locale = useLocale() as L;
  const slips = [
    { title: t("tapeTitle"), text: t("tapeText"), el: <TapeSlip locale={locale} /> },
    { title: t("sellersTitle"), text: t("sellersText"), el: <SellersSlip locale={locale} /> },
    { title: t("couponTitle"), text: t("couponText"), el: <CountdownSlip locale={locale} /> },
  ];
  return (
    <section className="wrap section">
      <h2 className="section-title">{t("highlightsTitle")}</h2>
      <p className="section-note">{t("sampleNote")}</p>
      <div className="highlights">
        {slips.map((s) => (
          <article key={s.title} className="slip">
            {s.el}
            <div className="slip-caption"><h3>{s.title}</h3><p>{s.text}</p></div>
          </article>
        ))}
      </div>
    </section>
  );
}
