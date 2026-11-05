import { NextResponse } from "next/server";
import { dailyCacheControl } from "@/lib/dailyCache";
import { getSql, getPlatformStats } from "@baga/db";

/**
 * Platform numbers for the home page Z-report. The same for every visitor and changed once a day by the collector,
 * so the CDN keeps a copy for up to an hour, never past the end of the day's collection. Without a database (fixtures mode) there is nothing real to show: null.
 */
export async function GET() {
  const sql = getSql();
  let stats = null;
  if (sql) {
    try {
      stats = await getPlatformStats(sql);
    } catch (e) {
      console.error(`[stats] ${e}`);
      return NextResponse.json(null, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }
  return NextResponse.json(stats, { headers: { "Cache-Control": dailyCacheControl() } });
}
