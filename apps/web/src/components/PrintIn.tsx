"use client";
import { motion, useReducedMotion } from "motion/react";

/** A receipt that feeds out of the printer, top to bottom. Plays once per mount, not on refreshes. */
export function PrintIn({ className, children }: { className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.article className={className} initial={reduce ? false : { clipPath: "inset(0 0 100% 0)", y: -10 }}
      animate={{ clipPath: "inset(0 0 0% 0)", y: 0 }} transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}>
      {children}
    </motion.article>
  );
}

/** A stamp pressed onto the paper once the receipt is out. */
export function StampIn({ children, delay = 0.45 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.span className="stamp" initial={reduce ? false : { scale: 1.9, opacity: 0, rotate: -14 }}
      animate={{ scale: 1, opacity: 0.92, rotate: -4 }} transition={{ type: "spring", stiffness: 520, damping: 17, delay }}>
      {children}
    </motion.span>
  );
}
