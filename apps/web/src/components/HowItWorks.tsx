"use client";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

// Each step is a small receipt slip with one quiet motion. The three play one after another, and the whole story
// starts again every CYCLE_MS while the section is on screen and each time the visitor comes back to it (the owner,
// 13 Nov: played once at page load, it was over before anyone scrolled down to it).
const CYCLE_MS = 9000;
/** When each step's own motion starts within a cycle, in seconds. */
const START = [0, 1.5, 2.9] as const;
const appear = (i: number) => ({ duration: 0.45, delay: 0.15 + i * 0.35 });

function LinkSlip({ go, d }: { go: boolean; d: number }) {
  const t = useTranslations("home");
  return (
    <div className="how-art" aria-hidden>
      <div className="how-link">
        <span className="how-link-text">kaspi.kz/shop/p/…</span>
        <motion.span className="how-link-select" initial={{ scaleX: 0 }} animate={go ? { scaleX: 1 } : {}} transition={{ duration: 0.6, delay: d + 0.3 }} />
      </div>
      <motion.span className="how-chip" initial={{ opacity: 0, y: 6 }} animate={go ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.3, delay: d + 1 }}>
        {t("howCopied")}
      </motion.span>
    </div>
  );
}

const BARS = [62, 70, 54, 66, 48, 58, 40, 52, 36, 44];
function HistorySlip({ go, d }: { go: boolean; d: number }) {
  return (
    <div className="how-art" aria-hidden>
      <div className="how-paste"><span>kaspi.kz/shop/p/…</span><span className="how-paste-btn" /></div>
      <div className="how-bars">
        {BARS.map((h, i) => (
          <motion.span key={i} className={i === BARS.length - 2 ? "is-min" : undefined} style={{ height: `${h}%` }}
            initial={{ scaleY: 0 }} animate={go ? { scaleY: 1 } : {}} transition={{ duration: 0.25, delay: d + 0.2 + i * 0.07 }} />
        ))}
      </div>
    </div>
  );
}

// A descending price line meets the dashed line of the visitor's own price; the stamp says we watch it, and the
// message arrives where they cross. An illustration: no prices, no numbers.
const PATH = "M0 8 L24 12 L44 6 L70 18 L94 15 L120 27 L144 23 L170 41 L200 44";
const CROSS = { x: 163.75, y: 38 }; // where the 144,23 → 170,41 segment meets the target line (y = 38)

function CouponSlip({ go, d }: { go: boolean; d: number }) {
  const t = useTranslations("home");
  const track = useTranslations("track");
  return (
    <div className="how-art how-watch" aria-hidden>
      <motion.span className="stamp how-stamp" initial={{ scale: 1.7, opacity: 0, rotate: -14 }} animate={go ? { scale: 1, opacity: 0.92, rotate: -6 } : {}}
        transition={{ type: "spring", stiffness: 480, damping: 18, delay: d + 0.2 }}>
        {track("trackingStamp")}
      </motion.span>
      <div className="how-chart">
        <svg viewBox="0 0 200 50" preserveAspectRatio="none">
          <line x1="0" y1="38" x2="200" y2="38" className="how-target" vectorEffect="non-scaling-stroke" />
          <motion.path d={PATH} className="how-price" vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }} animate={go ? { pathLength: 1 } : {}} transition={{ duration: 1.4, delay: d + 0.6, ease: "easeInOut" }} />
        </svg>
        <span className="how-target-label">{t("howTarget")}</span>
        <motion.span className="how-hit" style={{ left: `${(CROSS.x / 200) * 100}%`, top: `${(CROSS.y / 50) * 100}%` }}
          initial={{ scale: 0 }} animate={go ? { scale: 1 } : {}} transition={{ type: "spring", stiffness: 500, damping: 14, delay: d + 1.8 }} />
      </div>
      <motion.span className="how-chip how-alert" initial={{ opacity: 0, y: 8 }} animate={go ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.35, delay: d + 2.1 }}>
        <span className="how-alert-dot" />{t("howAlert")}
      </motion.span>
    </div>
  );
}

export function HowItWorks() {
  const t = useTranslations("home");
  const ref = useRef<HTMLOListElement>(null);
  const inView = useInView(ref, { amount: 0.5 });
  const reduce = useReducedMotion();
  const go = inView || !!reduce;
  // A new cycle remounts the three drawings, so each plays again from its first frame.
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    if (!inView || reduce) return;
    setCycle((c) => c + 1);
    const id = setInterval(() => setCycle((c) => c + 1), CYCLE_MS);
    return () => clearInterval(id);
  }, [inView, reduce]);
  const d = (i: number) => (reduce ? 0 : START[i]!);
  const steps = [
    { text: t("how1"), art: <LinkSlip key={cycle} go={go} d={d(0)} /> },
    { text: t("how2"), art: <HistorySlip key={cycle} go={go} d={d(1)} /> },
    { text: t("how3"), art: <CouponSlip key={cycle} go={go} d={d(2)} /> },
  ];
  return (
    <section className="wrap section">
      <h2 className="section-title">{t("howTitle")}</h2>
      <ol className="how" ref={ref}>
        {steps.map((s, i) => (
          <motion.li key={i} className="how-step" initial={false} animate={go ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }} transition={go ? appear(i) : { duration: 0 }}>
            {s.art}
            <div className="how-caption">
              <span key={cycle} className="how-num" style={{ animationDelay: `${d(i)}s` }}>{String(i + 1).padStart(2, "0")}</span>
              <p>{s.text}</p>
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
