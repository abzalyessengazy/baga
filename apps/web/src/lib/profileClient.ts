import type { LevelId } from "@baga/core";

/** /api/my/profile as the browser gets it. */
export type MyProfile = {
  watcher: boolean;
  profile?: { nickname: string | null; avatar: string | null; visitReason: string | null; interests: string[]; saveGoal: number | null; profileAt: string | null; onBoard: boolean; digest: boolean; since: string; internal?: boolean } | null;
  stats?: { tracked: number; total: number; potential: number; saved: number; rank: number | null; boardSize: number; tag: string | null; ahead: { rank: number; gap: number } | null };
  level?: { id: LevelId; index: number; next: { id: LevelId; need: number; from: number } | null; progress: number };
  /** Where alerts can go; telegramUrl only for someone who tracks products and has neither. */
  alerts?: { telegram: boolean; email: boolean; push?: boolean; emailPending?: string | null; telegramUrl: string | null };
};

/**
 * The visitor's profile. Several parts of a page ask at once (the board, the quiz, the nudge, the alerts bar): they
 * share one request for 3 s; `fresh` asks again (after a change, or back from the Telegram app).
 */
let shared: { at: number; p: Promise<MyProfile | null> } | null = null;
export const loadMyProfile = (fresh = false): Promise<MyProfile | null> => {
  if (!fresh && shared && Date.now() - shared.at < 3_000) return shared.p;
  const p = fetch("/api/my/profile", { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<MyProfile>) : null)).catch(() => null);
  shared = { at: Date.now(), p };
  return p;
};

/** Opens the questionnaire from anywhere on the page (the leaderboard's button, «Изменить» in the profile). */
export const QUIZ_EVENT = "baga:quiz";
/** Fired after the answers were saved: the board and the profile card reload. */
export const PROFILE_EVENT = "baga:profile";
export const openQuiz = () => window.dispatchEvent(new Event(QUIZ_EVENT));
// A saved change makes the shared answer stale (registered at import, so before any component's own listener).
if (typeof window !== "undefined") window.addEventListener(PROFILE_EVENT, () => { shared = null; });
