"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AVATARS, NICKNAME, cleanNickname, nicknameError } from "@baga/core";
import { Link } from "@/i18n/navigation";
import { loadMyProfile, PROFILE_EVENT } from "@/lib/profileClient";
import { Avatar } from "./Avatar";

/**
 * Under the coupon right after a visitor sets a price (the owner, 14 Nov; one step since 15 Nov: of 38 people on the
 * board none had a nickname, the five-question form was too much at that moment). Shows their place on the board and
 * asks for a nickname in place, with an avatar picked for them (changed later in the profile). Only for someone
 * without a profile; never a popup.
 */
export function BoardNudge() {
  const t = useTranslations("board");
  const tq = useTranslations("quiz");
  const locale = useLocale() as "ru" | "kk";
  const reduce = useReducedMotion();
  const [show, setShow] = useState(false);
  const [rank, setRank] = useState<{ n: number; of: number } | null>(null);
  const [nick, setNick] = useState("");
  const [avatar] = useState(() => AVATARS[Math.floor(Math.random() * AVATARS.length)]!);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const check = () => loadMyProfile().then((me) => {
      if (!live) return;
      setShow(!!me?.watcher && !me.profile?.profileAt && !me.profile?.internal);
      const s = me?.stats;
      setRank(s?.rank ? { n: s.rank, of: s.boardSize } : null);
    });
    check();
    window.addEventListener(PROFILE_EVENT, check);
    return () => { live = false; window.removeEventListener(PROFILE_EVENT, check); };
  }, []);

  const errText = (code: string) => tq(code === "taken" ? "errTaken" : code === "length" ? "errLength" : code === "personal" ? "errPersonal" : code === "reserved" ? "errReserved" : "errChars");
  const ideas = tq("nickIdeas").split(",").map((w) => w.trim()).filter(Boolean);
  const idea = () => { setNick(`${ideas[Math.floor(Math.random() * ideas.length)]}_${10 + Math.floor(Math.random() * 90)}`); setError(null); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = cleanNickname(nick);
    const bad = nicknameError(name);
    if (bad) return setError(errText(bad));
    setBusy(true);
    setError(null);
    const res = await fetch("/api/my/profile", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname: name, avatar, locale }),
    }).catch(() => null);
    const code = res ? ((await res.json().catch(() => ({}))) as { code?: string }).code : null;
    setBusy(false);
    if (res?.ok) {
      // The questionnaire's own memory: the profile exists, never offer it unasked again.
      try { localStorage.setItem("baga.quiz", JSON.stringify({ done: true })); } catch { /* private mode */ }
      setSaved(name);
      window.dispatchEvent(new Event(PROFILE_EVENT));
      return;
    }
    setError(code?.startsWith("nickname_") ? errText(code.slice(9)) : tq("errSave"));
  }

  if (!show && !saved) return null;
  return (
    <motion.div className="board-nudge" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.3 }}>
      <AnimatePresence mode="wait" initial={false}>
        {saved ? (
          <motion.p key="done" className="board-nudge-text" role="status" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <Avatar id={avatar} size={28} live /> {rank ? t("nudgeDone", { name: saved, rank: rank.n }) : t("nudgeDoneNoRank", { name: saved })}{" "}
            <Link href="/" className="board-nudge-link">{t("nudgeSee")}</Link>
          </motion.p>
        ) : (
          <motion.form key="ask" className="board-nudge-form" onSubmit={save} exit={reduce ? undefined : { opacity: 0, y: -6 }}>
            <p className="board-nudge-text">
              <span className="board-nudge-icon" aria-hidden>🏆</span>{" "}
              {rank ? t("nudgeRank", { rank: rank.n, total: rank.of }) : t("nudgeText")}
            </p>
            <div className="board-nudge-row">
              <input value={nick} maxLength={NICKNAME.max + 4} autoComplete="off" autoCapitalize="off" spellCheck={false}
                placeholder={tq("nickPlaceholder")} aria-label={tq("qNick")} aria-invalid={!!error}
                onChange={(e) => { setNick(e.target.value); setError(null); }} />
              <button type="button" className="quiz-dice" onClick={idea} aria-label={tq("nickIdea")} title={tq("nickIdea")}>🎲</button>
              <button type="submit" className="btn btn-stamp board-nudge-btn" disabled={busy}>{busy ? tq("saving") : t("nudgeSave")}</button>
            </div>
            {error && <p className="form-msg is-error" role="alert">{error}</p>}
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
