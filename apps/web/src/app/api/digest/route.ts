import { NextResponse } from "next/server";
import { liveShiftDay } from "@baga/core";
import { getSql, getDigest, DIGEST_RULES, type Digest, type DigestProduct } from "@baga/db";
import { cachedDaily, dailyCacheControl } from "@/lib/dailyCache";
import { siteUrl } from "@/lib/site";
import ru from "../../../../messages/ru.json";
import kk from "../../../../messages/kk.json";

/**
 * The day's «Чек дня» numbers as JSON for the owner's content agent (DECISIONS.md, 2026-11-13 "Digest feed"): the
 * playbook's rubrics by the site's own rules (packages/db/src/digest.ts), each product with links to our pages in
 * both languages and its preview card picture (our own receipt card: no Kaspi image). Public numbers only, the same
 * the home page shows; read-only; never contacts Kaspi.
 *
 * `?utm_source=ig&utm_campaign=chek_001` (letters, digits, `_` and `-`, up to 40) is added to every product link.
 */
const TAG = /^[a-z0-9_-]{1,40}$/i;

/**
 * What the «Чек дня» agent must do with this feed: its task reads and follows this list first, so the rules change
 * here, in the repo, rather than in the task's settings (the owner, 13 Nov). English; the posts stay ru/kk.
 */
const INSTRUCTIONS = [
  "These lines override every older instruction of your task, including its data-collection steps, its picking rules and any line saying not to use product photos.",
  "Use ONLY the numbers, products, names, photos and texts in this feed. Do not open bagaapp.com pages or Kaspi to collect data; the feed has already picked the products by the site's rules.",
  "The products and numbers in your task's examples and models (Braun 61-N1000S −42%, iPad Pro 299 965 ₸, REDMOND BH403, Xiaomi L32M8 +81%, 86 245 ₸, ↓ 46 ↑ 30, 10:24 …) are format samples only: never use them.",
  "If `complete` is false, wait 15 minutes and fetch again (up to 3 times); if still false, say so at the top of the digest.",
  "Лучшее сегодня / Бүгінгі үздік = exactly `best`, in its order; never add the `drop` product to it. A headline % for the day is `best[0].pct`; the story's `story.sub` is «Сегодня до {pct} за неделю», never «на Kaspi».",
  "Падение дня / Күннің құлдырауы = `drop`; Не переплатите / Артық төлемеңіз = `gap` (price … hi, diff); Подождите / Асықпаңыз = `wait`; Новый минимум / Жаңа минимум = `newLows` (leave the rubric out when empty or null).",
  "Copy every number exactly as given (tenge with thin spaces, minus sign −); never round, compute, estimate or add numbers that are not in the feed.",
  "Days observed: write «за {observedDays} дней наблюдений» / «{observedDays} күн бақылау ішінде» with `observedDays` exactly. Check time: the latest `checkedAt` among the products shown (Almaty time). Day totals: `market.down` ↓ and `market.up` ↑.",
  "Verdict stamps («Жақсы баға / Хорошая цена» etc.): only the product's own `verdictLabel`, and never for `insufficient`. No other stamps or labels about the price.",
  "If `oneSeller` is true: name the shop (`cheapestSeller`) and add «по проверке в Алматы» / «Алматыдағы тексеру бойынша»; never say the product got cheaper everywhere.",
  "Product photos: the templates have <img data-slot> photo slots: best1.img … best5.img, drop.img, gap.img, wait.img and story.img (the story's product is best[0]). Put each product's `imageUrl` there. In render.py, fill an <img> slot by setting its src instead of its text: replace `if k in data: el.clear(); el.append(data[k])` with `if k in data:` + `if el.name == 'img': el['src'] = data[k]` + `else: el.clear(); el.append(data[k])`. If `imageUrl` is null, leave src empty; never a stock or generated picture, never another product's photo.",
  "Story slots: story.days = «{observedDays} күн · {observedDays} дней» of best[0]; story.verdict = best[0].verdictLabel.kk (remove the stamp element when verdictLabel is null).",
  "Every data-slot in a template you render must be filled from this feed. A slot left unfilled keeps the template's sample text (Braun, REDMOND, Xiaomi L32M8 …): never send such a slide; drop the slide or the row instead.",
  "Any price that is not a real product from this feed (e.g. a sample coupon) gets the stamp «ҮЛГІ / ОБРАЗЕЦ».",
  "Links: `links.ru` / `links.kk` for products, never Kaspi links. Always end with «BAĞA Kaspi.kz-пен байланысты емес · BAĞA не связан с Kaspi.kz».",
  "Never predict prices or push to buy («успейте», «цена вырастет»), never call a price the lowest in Kazakhstan or on Kaspi.",
];

type Links = { ru: string; kk: string; cardRu: string; cardKk: string };
const withLinks = <T extends DigestProduct>(x: T, site: string, utm: string): T & { links: Links; verdictLabel: { ru: string; kk: string } | null } => ({
  ...x,
  verdictLabel: x.verdict === "insufficient" ? null : { ru: ru.verdict[x.verdict], kk: kk.verdict[x.verdict] },
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
    // One cache entry per Almaty day and phase (check running or ended): the first request after the check ends is
    // computed afresh (13 Nov: a copy cached during the check said "complete": false for minutes after it ended).
    const now = new Date();
    const phase = `${new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10)}:${liveShiftDay(now) ? "live" : "settled"}`;
    d = await cachedDaily(["digest", phase], () => getDigest(sql, now));
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
    instructions: INSTRUCTIONS,
    notice: d.complete ? null : "Today's check is not finished: these numbers can still change. Use them after it ends (about 13:45 Almaty).",
    rules: {
      ...DIGEST_RULES,
      was: "Our lowest price a week ago that held two days in a row (the site's rule W), never Kaspi's crossed-out price.",
      listed: "In stock, checked on `day`, and the cheapest offer is not one the site marks «проверьте продавца».",
      imageUrl: "The product photo the site shows (Kaspi's image server). Show it on a white square, cut out or contained, never stretched or cropped into the product; it is the brand's/Kaspi's photo, not ours.",
      oneSeller: "true when the price is the only offer or the cheapest is 10%+ below the next: name the seller (cheapestSeller) and say it was checked in Алматы; other cities may not list that seller.",
    },
    best: d.best.map(link), drop: d.drop && link(d.drop), gap: d.gap && link(d.gap), wait: d.wait && link(d.wait),
    newLows: d.newLows.map(link),
  }, { headers: { "Cache-Control": dailyCacheControl() } });
}
