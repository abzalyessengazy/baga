import { NextResponse } from "next/server";
import { getSql, listWatched } from "@baga/db";
import { slugName } from "@baga/core";
import { currentWatcher } from "@/lib/watcher";

/** This browser's tracked products for the home page (the cookie decides; no cookie, no database query). */
export async function GET() {
  const none = NextResponse.json({ count: 0, items: [] }, { headers: { "Cache-Control": "private, no-store" } });
  const found = await currentWatcher();
  const sql = getSql();
  if (!found || !sql) return none;
  const all = await listWatched(sql, found.watcher.id);
  const items = all.slice(0, 3).map((i) => ({
    externalId: i.externalId,
    imageUrl: i.imageUrl,
    name: i.title ?? (i.slug ? slugName(i.slug) : `№ ${i.externalId}`),
    targetPrice: i.targetPrice,
    currentMinPrice: i.currentMinPrice,
  }));
  return NextResponse.json({ count: all.length, items }, { headers: { "Cache-Control": "private, no-store" } });
}
