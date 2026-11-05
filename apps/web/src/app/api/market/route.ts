import { NextResponse } from "next/server";
import { dailyCacheControl } from "@/lib/dailyCache";
import { getSql, getMarket } from "@baga/db";

/**
 * Market numbers for the home page receipt "Kaspi сегодня" and its slips. The same for every visitor and changed
 * once a day by the collector, so the CDN keeps a copy for up to an hour, never past the end of the day's collection. Without a database there is nothing real: null.
 */
export async function GET() {
  const sql = getSql();
  let market = null;
  if (sql) {
    try {
      market = await getMarket(sql);
    } catch (e) {
      console.error(`[market] ${e}`);
      return NextResponse.json(null, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }
  return NextResponse.json(market, { headers: { "Cache-Control": dailyCacheControl() } });
}
