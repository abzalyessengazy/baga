"use client";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { useTranslations } from "next-intl";

/** "Честный чек": BAGA's three promises printed line by line, then stamped. Plays once. */
export function HonestReceipt() {
  const t = useTranslations("home");
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const go = inView || !!reduce;
  const lines = [t("trust1"), t("trust2"), t("trust3")];
  return (
    <section className="wrap section trust">
      <div>
        <h2 className="section-title">{t("trustTitle")}</h2>
        <p className="trust-text">{t("trustText")}</p>
      </div>
      <div className="slip trust-slip" ref={ref}>
        <ul className="trust-lines">
          {lines.map((l, i) => (
            <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={go ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.35, delay: 0.2 + i * 0.3 }}>
              <span className="trust-tick" aria-hidden>✓</span>{l}
            </motion.li>
          ))}
        </ul>
        <motion.span className="stamp trust-stamp" aria-hidden initial={{ scale: 1.8, opacity: 0, rotate: -16 }}
          animate={go ? { scale: 1, opacity: 0.92, rotate: -7 } : {}} transition={{ type: "spring", stiffness: 500, damping: 18, delay: 1.3 }}>
          {t("trustStamp")}
        </motion.span>
      </div>
    </section>
  );
}
