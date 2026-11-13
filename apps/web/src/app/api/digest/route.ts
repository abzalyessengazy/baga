import { NextResponse } from "next/server";
import { getSql, getDigest, DIGEST_RULES, type Digest, type DigestProduct } from "@baga/db";
import { cachedDaily, dailyCacheControl } from "@/lib/dailyCache";
import { siteUrl } from "@/lib/site";

/**
 * The day's «Чек дня» numbers as JSON for the owner's content agent (DECISIONS.md, 2026-11-13 "Digest feed"): the
 * playbook's rubrics by the site's own rules (packages/db/src/digest.ts), each product with links to our pages in
 * both languages and its preview card picture (our own receipt card: no Kaspi image). Public numbers only, the same
 * the home page shows; read-only; never contacts Kaspi.
 *
 * `?utm_source=ig&utm_campaign=chek_001` (letters, digits, `_` and `-`, up to 40) is added to every product link.
 */
const TAG = /^[a-z0-9_-]{1,40}$/i;

type Links = { ru: string; kk: string; cardRu: string; cardKk: string };
const withLinks = <T extends DigestProduct>(x: T, site: string, utm: string): T & { links: Links } => ({
  ...x,
  links: {
    ru: `${site}/ru/p/${x.externalId}${utm}`, kk: `${site}/kk/p/${x.externalId}${utm}`,
    cardRu: `${site}/ru/p/${x.externalId}/opengraph-image/card`, cardKk: `${site}/kk/p/${x.externalId}/opengraph-image/card`,
  },
});

export async function GET(req: Request) {
  const sql = getSql();
  if (!sql) return NextResponse.json(null, { headers: { "Cache-Control": "no-store" } });
  let d: Digest;
  try {
    d = await cachedDaily(["digest"], () => getDigest(sql));
  } catch (e) {
    console.error(`[digest] ${e}`);
    return NextResponse.json(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const q = new URL(req.url).searchParams;
  const tags = (["utm_source", "utm_medium", "utm_campaign"] as const)
    .flatMap((k) => { const v = q.get(k); return v && TAG.test(v) ? [`${k}=${v}`] : []; });
  const utm = tags.length ? `?${tags.join("&")}` : "";
  const site = siteUrl();
  const link = <T extends DigestProduct>(x: T) => withLinks(x, site, utm);
  return NextResponse.json({
    ...d,
    notice: d.complete ? null : "Today's check is not finished: these numbers can still change. Use them after it ends (about 13:45 Almaty).",
    rules: {
      ...DIGEST_RULES,
      was: "Our lowest price a week ago that held two days in a row (the site's rule W), never Kaspi's crossed-out price.",
      listed: "In stock, checked on `day`, and the cheapest offer is not one the site marks «проверьте продавца».",
      oneSeller: "true when the price is the only offer or the cheapest is 10%+ below the next: name the seller (cheapestSeller) and say it was checked in Алматы; other cities may not list that seller.",
    },
    best: d.best.map(link), drop: d.drop && link(d.drop), gap: d.gap && link(d.gap), wait: d.wait && link(d.wait),
    newLows: d.newLows.map(link),
  }, { headers: { "Cache-Control": dailyCacheControl() } });
}
