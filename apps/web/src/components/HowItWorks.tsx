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

// A descending price line meets the dashed line of the visitor's own price; the stamp says we watch it, and the
// message arrives where they cross. An illustration: no prices, no numbers.
const PATH = "M0 8 L24 12 L44 6 L70 18 L94 15 L120 27 L144 23 L170 41 L200 44";
const CROSS = { x: 163.75, y: 38 }; // where the 144,23 → 170,41 segment meets the target line (y = 38)

function CouponSlip({ go }: { go: boolean }) {
  const t = useTranslations("home");
  const track = useTranslations("track");
  return (
    <div className="how-art how-watch" aria-hidden>
      <motion.span className="stamp how-stamp" initial={{ scale: 1.7, opacity: 0, rotate: -14 }} animate={go ? { scale: 1, opacity: 0.92, rotate: -6 } : {}}
        transition={{ type: "spring", stiffness: 480, damping: 18, delay: 0.6 }}>
        {track("trackingStamp")}
      </motion.span>
      <div className="how-chart">
        <svg viewBox="0 0 200 50" preserveAspectRatio="none">
          <line x1="0" y1="38" x2="200" y2="38" className="how-target" vectorEffect="non-scaling-stroke" />
          <motion.path d={PATH} className="how-price" vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }} animate={go ? { pathLength: 1 } : {}} transition={{ duration: 1.4, delay: 1, ease: "easeInOut" }} />
        </svg>
        <span className="how-target-label">{t("howTarget")}</span>
        <motion.span className="how-hit" style={{ left: `${(CROSS.x / 200) * 100}%`, top: `${(CROSS.y / 50) * 100}%` }}
          initial={{ scale: 0 }} animate={go ? { scale: 1 } : {}} transition={{ type: "spring", stiffness: 500, damping: 14, delay: 2.2 }} />
      </div>
      <motion.span className="how-chip how-alert" initial={{ opacity: 0, y: 8 }} animate={go ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.35, delay: 2.5 }}>
        <span className="how-alert-dot" />{t("howAlert")}
      </motion.span>
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
