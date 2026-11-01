"use client";
import { motion, useAnimationControls, useMotionValue, useTransform, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * A coupon hanging off the bottom of a receipt. Drag it down or sideways past the tear line and it rips
 * off and falls away; let go early and it springs back. Keyboard users get a button that does the same.
 */
export function TearCoupon({
  children, onTorn, resetAfterMs, ghost,
}: {
  children: React.ReactNode;
  onTorn?: () => void;
  resetAfterMs?: number;
  ghost?: React.ReactNode;
}) {
  const t = useTranslations("receipt");
  const reduce = useReducedMotion();
  const controls = useAnimationControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-160, 0, 160], [-14, 0, 14]);
  const [torn, setTorn] = useState(false);

  async function tear(dirX = 1) {
    if (torn) return;
    setTorn(true);
    onTorn?.();
    if (reduce) await controls.start({ opacity: 0, transition: { duration: 0.01 } });
    else await controls.start({
      x: x.get() + dirX * 140, y: 520, rotate: dirX * 32, opacity: 0,
      transition: { type: "spring", stiffness: 40, damping: 12, opacity: { delay: 0.35, duration: 0.4 } },
    });
    if (resetAfterMs) {
      setTimeout(async () => {
        x.set(0); y.set(0);
        await controls.start({ x: 0, y: -20, rotate: 0, opacity: 0, transition: { duration: 0 } });
        setTorn(false);
        await controls.start({ y: 0, opacity: 1, transition: { type: "spring", stiffness: 260, damping: 22 } });
      }, resetAfterMs);
    }
  }

  return (
    <div className="coupon-zone">
      {ghost && <div className="coupon-ghost" aria-live="polite">{torn ? ghost : null}</div>}
      <motion.div
        className="coupon"
        style={{ x, y, rotate, transformOrigin: "50% 0%" }}
        animate={controls}
        drag={!torn}
        dragElastic={0.55}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragSnapToOrigin
        onDragEnd={(_, info) => {
          const dist = Math.hypot(info.offset.x, info.offset.y);
          if (dist > 110 || info.velocity.y > 900) tear(info.offset.x < 0 ? -1 : 1);
        }}
        whileDrag={{ scale: 1.01 }}
        aria-label={t("couponDrag")}
      >
        {children}
        {!torn && (
          <button type="button" className="tear-btn" onClick={() => tear(1)} onPointerDown={(e) => e.stopPropagation()}>
            {t("couponKeyboard")}
          </button>
        )}
      </motion.div>
    </div>
  );
}
