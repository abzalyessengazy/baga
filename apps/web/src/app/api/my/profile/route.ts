import { NextResponse } from "next/server";
import { cleanNickname, isAvatar, isInterest, isSaveGoal, isVisitReason, levelFor, nicknameError } from "@baga/core";
import { getSql, getProfile, getProfileStats, saveProfile, setProfileFlags } from "@baga/db";
import { allow } from "@/lib/rateLimit";
import { clientIp } from "@/lib/turnstile";
import { currentWatcher, ensureWatcher } from "@/lib/watcher";

const headers = { "Cache-Control": "private, no-store" };

/**
 * This browser's profile (DECISIONS.md, 2026-11-13 "Profiles, leaderboard and the 3-day note"): the nickname, avatar
 * and answers, with the sums of its own trackings and its place on the board. No cookie: { watcher: false }, and no
 * database query.
 */
export async function GET() {
  const found = await currentWatcher().catch(() => null);
  const sql = getSql();
  if (!found || !sql) return NextResponse.json({ watcher: false }, { headers });
  try {
    const profile = await getProfile(sql, found.watcher.id);
    const stats = await getProfileStats(sql, found.watcher.id);
    return NextResponse.json({ watcher: true, profile, stats, level: levelFor(stats.tracked) }, { headers });
  } catch (e) {
    console.error(`[profile] ${e}`);
    return NextResponse.json({ watcher: true, profile: null }, { headers });
  }
}

/**
 * Saves the answers of the short questionnaire: { nickname, avatar, visitReason?, interests?, saveGoal?, locale },
 * or switches { onBoard } / { digest }. Answering creates the anonymous watcher (the cookie) when there is none yet.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!allow(`profile:${ip}`, 20, 60 * 60 * 1000)) return NextResponse.json({ code: "rate_limited" }, { status: 429, headers });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sql = getSql();
  if (!sql) return NextResponse.json({ code: "not_ready" }, { status: 503, headers });
  if (typeof b.onBoard === "boolean" || typeof b.digest === "boolean") {
    const found = await currentWatcher();
    if (!found) return NextResponse.json({ code: "not_found" }, { status: 404, headers });
    await setProfileFlags(sql, found.watcher.id, {
      ...(typeof b.onBoard === "boolean" ? { onBoard: b.onBoard } : {}), ...(typeof b.digest === "boolean" ? { digest: b.digest } : {}) });
    return NextResponse.json({ code: "saved" }, { headers });
  }
  const nickname = typeof b.nickname === "string" ? cleanNickname(b.nickname) : "";
  const bad = nicknameError(nickname);
  if (bad) return NextResponse.json({ code: `nickname_${bad}` }, { status: 400, headers });
  if (!isAvatar(b.avatar)) return NextResponse.json({ code: "bad_avatar" }, { status: 400, headers });
  const interests = Array.isArray(b.interests) ? [...new Set(b.interests.filter(isInterest))].slice(0, 8) : [];
  const watcher = await ensureWatcher(b.locale === "kk" ? "kk" : "ru");
  if (!watcher) return NextResponse.json({ code: "not_ready" }, { status: 503, headers });
  try {
    const r = await saveProfile(sql, watcher.id, {
      nickname, avatar: b.avatar, visitReason: isVisitReason(b.visitReason) ? b.visitReason : null, interests, saveGoal: isSaveGoal(b.saveGoal) ? b.saveGoal : null });
    if (r === "taken") return NextResponse.json({ code: "nickname_taken" }, { status: 409, headers });
  } catch (e) {
    console.error(`[profile] ${e}`);
    return NextResponse.json({ code: "not_ready" }, { status: 503, headers });
  }
  return NextResponse.json({ code: "saved" }, { headers });
}
