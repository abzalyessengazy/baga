import { NextResponse } from "next/server";
import { getSql, listWatched } from "@baga/db";
import { slugName } from "@baga/core";
import { getTranslations } from "next-intl/server";
import { currentWatcher } from "@/lib/watcher";

/** This browser's tracked products for the home page (the cookie decides; no cookie, no database query). */
export async function GET(req: Request) {
  const none = NextResponse.json({ count: 0, items: [] }, { headers: { "Cache-Control": "private, no-store" } });
  const found = await currentWatcher();
  const sql = getSql();
  if (!found || !sql) return none;
  const all = await listWatched(sql, found.watcher.id);
  const locale = new URL(req.url).searchParams.get("l") === "kk" ? "kk" : found.watcher.locale;
  const t = await getTranslations({ locale, namespace: "my" });
  const items = all.slice(0, 3).map((i) => ({
    trackingId: i.trackingId,
    href: i.pagePath,
    imageUrl: i.imageUrl,
    name: i.title ?? (i.slug ? slugName(i.slug) : i.externalId ? `№ ${i.externalId}` : t("shortLinkItem")),
    targetPrice: i.targetPrice,
    currentMinPrice: i.currentMinPrice,
  }));
  return NextResponse.json({ count: all.length, items }, { headers: { "Cache-Control": "private, no-store" } });
}
