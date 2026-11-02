"use client";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { useTranslations } from "next-intl";

// Each step is a small receipt slip with one quiet motion, played once when the section comes into view.
const appear = (i: number) => ({ duration: 0.45, delay: 0.15 + i * 0.35 });

function LinkSlip({ go }: { go: boolean }) {
  const t = useTranslations("home");
  return (
    <div className="how-art" aria-hidden>
      <div className="how-link">
        <span className="how-link-text">kaspi.kz/shop/p/…</span>
        <motion.span className="how-link-select" initial={{ scaleX: 0 }} animate={go ? { scaleX: 1 } : {}} transition={{ duration: 0.6, delay: 0.3 }} />
      </div>
      <motion.span className="how-chip" initial={{ opacity: 0, y: 6 }} animate={go ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.3, delay: 1 }}>
        {t("howCopied")}
      </motion.span>
    </div>
  );
}

const BARS = [62, 70, 54, 66, 48, 58, 40, 52, 36, 44];
function HistorySlip({ go }: { go: boolean }) {
  return (
    <div className="how-art" aria-hidden>
      <div className="how-paste"><span>kaspi.kz/shop/p/…</span><span className="how-paste-btn" /></div>
      <div className="how-bars">
        {BARS.map((h, i) => (
          <motion.span key={i} className={i === BARS.length - 2 ? "is-min" : undefined} style={{ height: `${h}%` }}
            initial={{ scaleY: 0 }} animate={go ? { scaleY: 1 } : {}} transition={{ duration: 0.25, delay: 0.9 + i * 0.06 }} />
        ))}
      </div>
    </div>
  );
}

function CouponSlip({ go }: { go: boolean }) {
  const t = useTranslations("track");
  return (
    <div className="how-art" aria-hidden>
      <motion.div className="how-coupon" initial={{ y: 0, rotate: 0 }} animate={go ? { y: 10, rotate: -3 } : {}} transition={{ duration: 0.5, delay: 1.6 }}>
        <span className="how-coupon-line" />
        <span className="how-coupon-line short" />
        <motion.span className="stamp how-stamp" initial={{ scale: 1.7, opacity: 0, rotate: -14 }} animate={go ? { scale: 1, opacity: 0.92, rotate: -6 } : {}}
          transition={{ type: "spring", stiffness: 480, damping: 18, delay: 2 }}>
          {t("trackingStamp")}
        </motion.span>
      </motion.div>
    </div>
  );
}

export function HowItWorks() {
  const t = useTranslations("home");
  const ref = useRef<HTMLOListElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const reduce = useReducedMotion();
  const go = inView || !!reduce;
  const steps = [
    { text: t("how1"), art: <LinkSlip go={go} /> },
    { text: t("how2"), art: <HistorySlip go={go} /> },
    { text: t("how3"), art: <CouponSlip go={go} /> },
  ];
  return (
    <section className="wrap section">
      <h2 className="section-title">{t("howTitle")}</h2>
      <ol className="how" ref={ref}>
        {steps.map((s, i) => (
          <motion.li key={i} className="how-step" initial={{ opacity: 0, y: 14 }} animate={go ? { opacity: 1, y: 0 } : {}} transition={appear(i)}>
            {s.art}
            <div className="how-caption">
              <span className="how-num">{String(i + 1).padStart(2, "0")}</span>
              <p>{s.text}</p>
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
