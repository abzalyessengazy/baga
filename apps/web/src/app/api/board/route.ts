import { NextResponse } from "next/server";
import { getSql, getBoard } from "@baga/db";

/**
 * The home page leaderboard (DECISIONS.md, 2026-11-13 "Profiles, leaderboard and the 3-day note"): the top ten by
 * «хочет сэкономить». Nicknames and stock avatars only; a watcher without a nickname shows as a numbered buyer.
 * The same for everyone, so the CDN keeps it for a minute. null without a database or before migration 0027.
 */
export async function GET() {
  const sql = getSql();
  if (!sql) return NextResponse.json(null, { headers: { "Cache-Control": "no-store" } });
  try {
    return NextResponse.json(await getBoard(sql), { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (e) {
    console.error(`[board] ${e}`);
    return NextResponse.json(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
