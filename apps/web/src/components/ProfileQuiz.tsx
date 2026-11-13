"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AVATARS, INTEREST_CODES, NICKNAME, SAVE_GOALS, VISIT_REASONS, cleanNickname, formatTenge, nicknameError, type Avatar as AvatarId, type Interest, type VisitReason } from "@baga/core";
import { Link, usePathname } from "@/i18n/navigation";
import { loadMyProfile, PROFILE_EVENT, QUIZ_EVENT } from "@/lib/profileClient";
import { Avatar } from "./Avatar";

const STATE_KEY = "baga.quiz";
const VISITS_KEY = "baga.visits";
const SESSION_KEY = "baga.vs";
/** Asked again a week after «Позже», twice at most. */
const ASK_AGAIN_MS = 7 * 24 * 3600 * 1000, MAX_ASKS = 2;
/** Pages where a question would get in the way of the one thing the visitor came to do. */
const QUIET = ["/admin", "/email", "/bought", "/l/", "/privacy", "/terms"];

type Saved = { done?: boolean; later?: number; asks?: number };
const read = (): Saved => { try { return JSON.parse(localStorage.getItem(STATE_KEY) ?? "{}") as Saved; } catch { return {}; } };
const write = (s: Saved) => { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* private mode */ } };

/** How many separate visits (browser sessions) this browser has made, this one included. */
function visits(): number {
  try {
    let n = Number(localStorage.getItem(VISITS_KEY) ?? 0) || 0;
    if (!sessionStorage.getItem(SESSION_KEY)) {
      sessionStorage.setItem(SESSION_KEY, "1");
      localStorage.setItem(VISITS_KEY, String(++n));
    }
    return n;
  } catch { return 0; }
}

const STEPS = ["avatar", "nick", "reason", "interests", "goal"] as const;
type Step = (typeof STEPS)[number] | "done";

/**
 * The short questionnaire (DECISIONS.md, 2026-11-13 "Profiles, leaderboard and the 3-day note"): five taps for an
 * avatar, a nickname, why the visitor came, what interests them and how much they want to save. Offered on a second
 * visit, a few seconds in; opened at once by the leaderboard's button or «Изменить» in the profile. Nothing personal
 * is asked, every question after the nickname can be skipped, and «Позже» is always there.
 */
export function ProfileQuiz() {
  const t = useTranslations("quiz");
  const locale = useLocale() as "ru" | "kk";
  const path = usePathname();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("avatar");
  const [dir, setDir] = useState(1);
  const [avatar, setAvatar] = useState<AvatarId | null>(null);
  const [nick, setNick] = useState("");
  const [reason, setReason] = useState<VisitReason | null>(null);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [goal, setGoal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  const show = useCallback(async () => {
    const me = await loadMyProfile();
    const p = me?.profile;
    if (p?.profileAt) {
      setEditing(true);
      setAvatar((AVATARS as readonly string[]).includes(p.avatar ?? "") ? (p.avatar as AvatarId) : null);
      setNick(p.nickname ?? "");
      setReason((VISIT_REASONS as readonly string[]).includes(p.visitReason ?? "") ? (p.visitReason as VisitReason) : null);
      setInterests(p.interests.filter((i): i is Interest => (INTEREST_CODES as string[]).includes(i)));
      setGoal(p.saveGoal);
    }
    setStep("avatar");
    setError(null);
    setOpen(true);
    return !!p?.profileAt;
  }, []);

  // The leaderboard's button and the profile's «Изменить».
  useEffect(() => {
    const on = () => { void show(); };
    window.addEventListener(QUIZ_EVENT, on);
    return () => window.removeEventListener(QUIZ_EVENT, on);
  }, [show]);

  // On a second visit, once, a few seconds after the page is there.
  useEffect(() => {
    const n = visits();
    const s = read();
    if (n < 2 || s.done || QUIET.some((q) => path.startsWith(q))) return;
    if (s.later && (Date.now() - s.later < ASK_AGAIN_MS || (s.asks ?? 0) >= MAX_ASKS)) return;
    let live = true;
    const timer = setTimeout(async () => {
      // The board answers only once the profile columns exist: no questions before the server can keep the answers.
      const ready = await fetch("/api/board").then((r) => r.ok).catch(() => false);
      if (!ready || !live) return;
      const me = await loadMyProfile();
      if (!live) return;
      if (me?.profile?.profileAt) { write({ done: true }); return; }
      void show();
    }, 3500);
    return () => { live = false; clearTimeout(timer); };
    // Once per page load: the path it opened on decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback((later: boolean) => {
    if (later && !editing) { const s = read(); write({ ...s, later: Date.now(), asks: (s.asks ?? 0) + 1 }); }
    setOpen(false);
  }, [editing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(step !== "done"); };
    window.addEventListener("keydown", onKey);
    card.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, step]);

  const i = STEPS.indexOf(step as (typeof STEPS)[number]);
  const go = (to: Step, d: number) => { setDir(d); setError(null); setStep(to); };
  const nickBad = nick ? nicknameError(nick) : null;

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/my/profile", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: cleanNickname(nick), avatar, visitReason: reason, interests, saveGoal: goal, locale }),
    }).catch(() => null);
    const code = res ? ((await res.json().catch(() => ({}))) as { code?: string }).code : null;
    setBusy(false);
    if (res?.ok) {
      write({ done: true });
      go("done", 1);
      window.dispatchEvent(new Event(PROFILE_EVENT));
      return;
    }
    if (code?.startsWith("nickname_")) { go("nick", -1); setError(t(code === "nickname_taken" ? "errTaken" : code === "nickname_length" ? "errLength" : code === "nickname_personal" ? "errPersonal" : code === "nickname_reserved" ? "errReserved" : "errChars")); }
    else setError(t("errSave"));
  }

  function next() {
    if (step === "avatar") { if (!avatar) return setError(t("errAvatar")); go("nick", 1); }
    else if (step === "nick") {
      const bad = nicknameError(nick);
      if (bad) return setError(t(bad === "length" ? "errLength" : bad === "personal" ? "errPersonal" : bad === "reserved" ? "errReserved" : "errChars"));
      go("reason", 1);
    }
    else if (step === "reason") go("interests", 1);
    else if (step === "interests") go("goal", 1);
    else if (step === "goal") void save();
  }

  const ideas = t("nickIdeas").split(",").map((w) => w.trim()).filter(Boolean);
  const idea = () => { setNick(`${ideas[Math.floor(Math.random() * ideas.length)]}_${10 + Math.floor(Math.random() * 90)}`); setError(null); };
  const toggle = (c: Interest) => setInterests((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]));
  const slide = reduce ? {} : { initial: { opacity: 0, x: 28 * dir }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -28 * dir } };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="quiz-veil" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
          onClick={(e) => { if (e.target === e.currentTarget) close(step !== "done"); }}>
          <motion.div className="quiz receipt" role="dialog" aria-modal="true" aria-label={t("title")} tabIndex={-1} ref={card}
            initial={reduce ? false : { y: 60, opacity: 0, rotate: -1.5 }} animate={{ y: 0, opacity: 1, rotate: 0 }} exit={reduce ? { opacity: 0 } : { y: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}>
            <button type="button" className="quiz-x" aria-label={t("close")} onClick={() => close(step !== "done")}>×</button>
            {step !== "done" && (
              <>
                <p className="quiz-kicker">{editing ? t("kickerEdit") : t("kicker")}</p>
                <div className="quiz-dots" aria-label={t("stepOf", { n: i + 1, all: STEPS.length })}>
                  {STEPS.map((s, k) => <span key={s} className={k < i ? "is-done" : k === i ? "is-on" : undefined} />)}
                </div>
              </>
            )}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={step} className="quiz-step" {...slide} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
                {step === "avatar" && (
                  <>
                    <h2>{t("qAvatar")}</h2>
                    <div className="quiz-avatars" role="radiogroup" aria-label={t("qAvatar")}>
                      {AVATARS.map((a) => (
                        <motion.button key={a} type="button" role="radio" aria-checked={avatar === a} aria-label={t(`avatar.${a}`)}
                          className={`quiz-avatar${avatar === a ? " is-on" : ""}`} whileTap={{ scale: 0.9 }}
                          animate={avatar === a && !reduce ? { y: [0, -8, 0], rotate: [0, -8, 8, 0] } : { y: 0, rotate: 0 }} transition={{ duration: 0.45 }}
                          onClick={() => { setAvatar(a); setError(null); }}>
                          <Avatar id={a} size={52} />
                        </motion.button>
                      ))}
                    </div>
                  </>
                )}
                {step === "nick" && (
                  <>
                    <h2>{t("qNick")}</h2>
                    <div className="quiz-nick">
                      <Avatar id={avatar} size={44} live />
                      <input value={nick} maxLength={NICKNAME.max + 4} autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder={t("nickPlaceholder")}
                        aria-label={t("qNick")} aria-invalid={!!nickBad} onChange={(e) => { setNick(e.target.value); setError(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") next(); }} />
                      <button type="button" className="quiz-dice" onClick={idea} aria-label={t("nickIdea")} title={t("nickIdea")}>🎲</button>
                    </div>
                    <p className="note">{t("nickNote")}</p>
                  </>
                )}
                {step === "reason" && (
                  <>
                    <h2>{t("qReason")}</h2>
                    <div className="quiz-options" role="radiogroup" aria-label={t("qReason")}>
                      {VISIT_REASONS.map((r) => (
                        <button key={r} type="button" role="radio" aria-checked={reason === r} className={`quiz-option${reason === r ? " is-on" : ""}`} onClick={() => setReason(r)}>{t(`reason.${r}`)}</button>
                      ))}
                    </div>
                  </>
                )}
                {step === "interests" && (
                  <>
                    <h2>{t("qInterests")}</h2>
                    <div className="quiz-chips">
                      {INTEREST_CODES.map((c) => (
                        <button key={c} type="button" aria-pressed={interests.includes(c)} className={`quiz-chip${interests.includes(c) ? " is-on" : ""}`} onClick={() => toggle(c)}>{t(`interest.${c}`)}</button>
                      ))}
                    </div>
                    <p className="note">{t("interestsNote")}</p>
                  </>
                )}
                {step === "goal" && (
                  <>
                    <h2>{t("qGoal")}</h2>
                    <div className="quiz-options is-goals" role="radiogroup" aria-label={t("qGoal")}>
                      {SAVE_GOALS.map((g) => (
                        <button key={g} type="button" role="radio" aria-checked={goal === g} className={`quiz-option${goal === g ? " is-on" : ""}`} onClick={() => setGoal(g)}>{formatTenge(g, locale)}</button>
                      ))}
                    </div>
                    <p className="note">{t("goalNote")}</p>
                  </>
                )}
                {step === "done" && (
                  <div className="quiz-done">
                    <motion.span className="stamp quiz-stamp" initial={reduce ? false : { scale: 2, opacity: 0, rotate: -18 }} animate={{ scale: 1, opacity: 0.92, rotate: -6 }}
                      transition={{ type: "spring", stiffness: 480, damping: 16, delay: 0.15 }}>{t("doneStamp")}</motion.span>
                    <Avatar id={avatar} size={72} live />
                    <h2>{t("doneTitle", { name: cleanNickname(nick) })}</h2>
                    <p>{t("doneText")}</p>
                    <div className="quiz-actions">
                      <Link href="/my" className="btn btn-stamp" onClick={() => setOpen(false)}>{t("toProfile")}</Link>
                      <button type="button" className="link-btn" onClick={() => setOpen(false)}>{t("close")}</button>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
            {error && <p className="form-msg is-error" role="alert">{error}</p>}
            {step !== "done" && (
              <div className="quiz-actions">
                {i > 0 ? <button type="button" className="link-btn" onClick={() => go(STEPS[i - 1]!, -1)}>{t("back")}</button>
                  : <button type="button" className="link-btn" onClick={() => close(true)}>{editing ? t("close") : t("later")}</button>}
                <button type="button" className="btn btn-stamp" onClick={next} disabled={busy}>
                  {busy ? t("saving") : step === "goal" ? t("finish") : (step === "reason" && !reason) || (step === "interests" && !interests.length) ? t("skip") : t("next")}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
