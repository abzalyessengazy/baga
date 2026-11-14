"use client";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { loadMyProfile, openQuiz, PROFILE_EVENT } from "@/lib/profileClient";

/**
 * Under the coupon right after a visitor sets a price (the owner, 14 Nov): the moment they showed real interest, one
 * quiet line invites them onto the leaderboard. Only for someone without a profile; it opens the same questionnaire
 * and goes away once they have one. Never a popup.
 */
export function BoardNudge() {
  const t = useTranslations("board");
  const reduce = useReducedMotion();
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    const check = () => loadMyProfile().then((me) => { if (live) setShow(!!me?.watcher && !me.profile?.profileAt && !me.profile?.internal); });
    check();
    window.addEventListener(PROFILE_EVENT, check);
    return () => { live = false; window.removeEventListener(PROFILE_EVENT, check); };
  }, []);
  if (!show) return null;
  return (
    <motion.div className="board-nudge" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.3 }}>
      <span className="board-nudge-icon" aria-hidden>🏆</span>
      <span className="board-nudge-text">{t("nudgeText")}</span>
      <button type="button" className="btn btn-stamp board-nudge-btn" onClick={openQuiz}>{t("nudgeButton")}</button>
    </motion.div>
  );
}
