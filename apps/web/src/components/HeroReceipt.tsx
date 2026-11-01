"use client";
import { motion, useReducedMotion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge } from "@baga/core";
import { TearCoupon } from "./TearCoupon";
import { Line } from "./ReceiptBits";

/** Sample receipt for the landing page. Clearly stamped as a sample: the numbers are illustrative. */
const WEEKS = [759990, 749990, 739990, 744990, 729990, 719990, 734990, 714990, 689990, 709990, 704990, 699990];
const SELLERS = [
  { name: "Mobile City", price: 699990 },
  { name: "Техно Алем", price: 704500 },
  { name: "Gadget Point", price: 712000 },
];
const NOW = 699990;
const TARGET = 679990;

// Printer feed: the paper advances in small steps, like a thermal printer.
const printerEase = (t: number) => Math.round(t * 28) / 28;

export function HeroReceipt({ onTorn }: { onTorn?: () => void }) {
  const t = useTranslations("receipt");
  const tv = useTranslations("verdict");
  const locale = useLocale() as "ru" | "kk";
  const reduce = useReducedMotion();
  const max = Math.max(...WEEKS);
  const min = Math.min(...WEEKS);
  const f = (n: number) => formatTenge(n, locale);

  return (
    <div className="printer" aria-label={t("sample")}>
      <div className="printer-slot" aria-hidden />
      <div className="printer-mouth">
        <motion.div
          initial={reduce ? false : { y: "-101%" }}
          animate={{ y: 0 }}
          transition={{ duration: 2.2, ease: printerEase, delay: 0.25 }}
        >
          <div className="receipt">
            <span className="stamp stamp-sample" aria-hidden>{t("sample")}</span>
            <div className="receipt-center">
              <div className="receipt-store">{t("store")}</div>
              <div className="receipt-sub">{t("storeLine")}</div>
            </div>
            <hr className="rule" />
            <Line k={t("item")} v={t("sampleItem")} />
            <Line k={t("date")} v={t("today")} />
            <hr className="rule" />
            <div className="receipt-caption">{t("history")}</div>
            <div className="bars" aria-hidden>
              {WEEKS.map((p, i) => (
                <span key={i} className={p === min ? "is-min" : undefined} style={{ height: `${28 + ((p - 680000) / (max - 680000)) * 72}%` }} />
              ))}
            </div>
            <Line k={t("min")} v={f(min)} />
            <Line k={t("typical")} v={`${f(709990)} – ${f(739990)}`} />
            <Line k={t("max")} v={f(max)} />
            <hr className="rule" />
            <div className="receipt-caption">{t("sellers")}</div>
            {SELLERS.map((s) => <Line key={s.name} k={s.name} v={f(s.price)} />)}
            <hr className="rule" />
            <div className="total">
              <span className="total-label">{t("total")}</span>
              <span className="total-value">{f(NOW)}</span>
              <span className="total-sub">{t("from", { count: 30 })}</span>
            </div>
            <div className="verdict-line">
              <span className="receipt-sub">{t("verdict")}</span>
              <span className="stamp">{tv("low")}</span>
            </div>
            <div className="barcode" aria-hidden />
            <div className="receipt-center receipt-sub">{t("thanks")}</div>
          </div>
          <div className="perforation" aria-hidden />
          <TearCoupon onTorn={onTorn} resetAfterMs={3200} ghost={t("couponTorn")}>
            <div className="coupon-head"><span>{t("couponLabel")}</span><span>№ 0001</span></div>
            <div className="coupon-price">{f(TARGET)}</div>
            <div className="coupon-hint"><DragIcon />{t("couponDrag")}</div>
          </TearCoupon>
        </motion.div>
      </div>
    </div>
  );
}

function DragIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M8 2v12M4 10l4 4 4-4" />
    </svg>
  );
}
