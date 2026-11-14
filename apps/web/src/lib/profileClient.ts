import type { LevelId } from "@baga/core";

/** /api/my/profile as the browser gets it. */
export type MyProfile = {
  watcher: boolean;
  profile?: { nickname: string | null; avatar: string | null; visitReason: string | null; interests: string[]; saveGoal: number | null; profileAt: string | null; onBoard: boolean; digest: boolean; since: string; internal?: boolean } | null;
  stats?: { tracked: number; total: number; potential: number; saved: number; rank: number | null; boardSize: number; tag: string | null; ahead: { rank: number; gap: number } | null };
  level?: { id: LevelId; index: number; next: { id: LevelId; need: number; from: number } | null; progress: number };
};

export const loadMyProfile = (): Promise<MyProfile | null> =>
  fetch("/api/my/profile", { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<MyProfile>) : null)).catch(() => null);

/** Opens the questionnaire from anywhere on the page (the leaderboard's button, «Изменить» in the profile). */
export const QUIZ_EVENT = "baga:quiz";
/** Fired after the answers were saved: the board and the profile card reload. */
export const PROFILE_EVENT = "baga:profile";
export const openQuiz = () => window.dispatchEvent(new Event(QUIZ_EVENT));
