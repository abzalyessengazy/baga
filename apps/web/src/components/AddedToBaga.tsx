"use client";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";

/**
 * The welcome on a product we have no price for yet (the owner, 16 Nov: never «we can't check today, tomorrow»): a
 * check mark draws itself, «Товар добавлен в BAĞA», and a live line saying its price history is being kept from now
 * on. No promise of a time; the status under it (fetching now / checking on request) is the page's.
 */
export function AddedToBaga() {
  const t = useTranslations("product");
  const reduce = useReducedMotion();
  const pop = (delay: number) => (reduce ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.35 } });
  return (
    <div className="added">
      <motion.svg className="added-check" viewBox="0 0 52 52" width="56" height="56" aria-hidden
        initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 16, delay: 0.15 }}>
        <motion.circle cx="26" cy="26" r="23" fill="none" stroke="currentColor" strokeWidth="3"
          initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.2 }} />
        <motion.path d="M15 27l7.5 7.5L38 19" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.65 }} />
      </motion.svg>
      <motion.h1 className="added-title" {...pop(0.5)}>{t("addedTitle")}</motion.h1>
      <motion.p className="added-text" {...pop(0.7)}>{t("addedText")}</motion.p>
      <motion.p className="added-live" {...pop(0.9)}><span className="added-dot" aria-hidden />{t("addedLive")}</motion.p>
    </div>
  );
}
