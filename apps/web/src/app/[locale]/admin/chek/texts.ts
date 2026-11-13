import { formatTenge } from "@baga/core";
import type { Digest, DigestProduct } from "@baga/db";
import { dmy, shortName, type Pair, type Tr } from "./Slides";

/**
 * Ready-to-paste texts for each «Чек дня» rubric and platform: Instagram post, Reels, TikTok and story. Kazakh block
 * first, then Russian; every product line carries its own link, tagged by platform so the report can tell which
 * channel brought the visit. Numbers exactly as in the digest (rule 2).
 */
export type Platform = "post" | "reel" | "tiktok" | "story";
export const PLATFORMS: Platform[] = ["post", "reel", "tiktok", "story"];
const UTM: Record<Platform, [string, string]> = { post: ["ig", "post"], reel: ["ig", "reel"], tiktok: ["tiktok", "video"], story: ["ig", "story"] };

export type Rubric = "day" | "best" | "drop" | "gap" | "wait" | "newLows";
export type Pack = { hook: string; caption: Record<Exclude<Platform, "story">, string>; story: { sticker: string; linkRu: string; linkKk: string } };

type Loc = "kk" | "ru";
type Ctx = { d: Digest; t: Pair; site: string; campaign: string; issue: string; time: string };
const pct = (n: number) => (n < 0 ? `−${-n}%` : `+${n}%`);
const tg = formatTenge;

const link = (c: Ctx, x: DigestProduct, loc: Loc, p: Platform) =>
  `${c.site}/${loc}/p/${x.externalId}?utm_source=${UTM[p][0]}&utm_medium=${UTM[p][1]}&utm_campaign=${c.campaign}`;

const withShop = (l: Tr, x: DigestProduct, line: string) =>
  x.oneSeller && x.cheapestSeller ? `${line} (${l("capOneSeller", { shop: x.cheapestSeller })})` : line;

/** The rubric's lines in one language, each product followed by its link. */
function lines(c: Ctx, r: Rubric, loc: Loc, p: Platform): string[] {
  const { d } = c;
  const l = c.t[loc];
  const to = (x: DigestProduct) => `→ ${link(c, x, loc, p)}`;
  const best = () => [`↓ ${l("best")}`, ...d.best.flatMap((x, i) => [
    withShop(l, x, l("capRow", { i: String(i + 1).padStart(2, "0"), name: shortName(x.title), price: tg(x.price), pct: pct(x.pct), days: x.observedDays })), to(x)])];
  const drop = () => d.drop ? [withShop(l, d.drop, l("capDrop", { name: shortName(d.drop.title), diff: tg(d.drop.diff), price: tg(d.drop.price) })), l("capDays", { days: d.drop.observedDays }), to(d.drop)] : [];
  const gap = () => d.gap ? [l("capGap", { name: shortName(d.gap.title), lo: tg(d.gap.price), hi: tg(d.gap.hi), diff: tg(d.gap.diff) }), to(d.gap)] : [];
  const wait = () => d.wait ? [withShop(l, d.wait, l("capWait", { name: shortName(d.wait.title), pct: pct(d.wait.pct), price: tg(d.wait.price) })), l("capDays", { days: d.wait.observedDays }), to(d.wait)] : [];
  const lows = () => d.newLows.length ? [`${l("newLow")}:`, ...d.newLows.flatMap((x) => [l("capLowRow", { name: shortName(x.title), price: tg(x.price), days: x.observedDays }), to(x)])] : [];
  switch (r) {
    case "day": return [...best(), "", ...drop(), "", ...gap(), "", ...wait(), ...(d.newLows.length ? ["", ...lows()] : []), "", l("capMarket", { down: d.market.down, up: d.market.up })];
    case "best": return best();
    case "drop": return drop();
    case "gap": return gap();
    case "wait": return wait();
    case "newLows": return lows();
  }
}

function caption(c: Ctx, r: Rubric, p: Platform): string {
  const date = `${c.d.date.slice(8, 10)}.${c.d.date.slice(5, 7)}`;
  const block = (loc: Loc) => {
    const l = c.t[loc];
    return [l("capTitle", { issue: c.issue, date }), l("capIntro"), l("capChecked", { date: dmy(c.d.date), time: c.time }), "", ...lines(c, r, loc, p), "", l("capEnd")].join("\n");
  };
  return [block("kk"), "—", block("ru"), "", `${c.t.kk("disclaimer")} · ${c.t.ru("disclaimer")}`, "", c.t.ru("capTags")].join("\n");
}

/** The short line for the video's first seconds and the story sticker, kk then ru. */
function hook(c: Ctx, r: Rubric): string {
  const { d, t } = c;
  const lead = d.best[0];
  switch (r) {
    case "day":
    case "best": return lead ? `${t.kk("storyToday")} ${pct(lead.pct)}\n${t.ru("storyToday", { pct: pct(lead.pct) })}` : "";
    case "drop": return d.drop ? `${t.kk("dropSub")}: −${tg(d.drop.diff)}\n${t.ru("dropSub")}: −${tg(d.drop.diff)}` : "";
    case "gap": return d.gap ? `${t.kk("gapHead")}: ${t.kk("difference").toLowerCase()} ${tg(d.gap.diff)}\n${t.ru("gapHead")}: ${t.ru("difference").toLowerCase()} ${tg(d.gap.diff)}` : "";
    case "wait": return d.wait ? `${t.kk("waitHead")}: ${pct(d.wait.pct)}\n${t.ru("waitHead")}: ${pct(d.wait.pct)}` : "";
    case "newLows": return d.newLows[0] ? `${t.kk("newLow")}: ${shortName(d.newLows[0].title)}\n${t.ru("newLow")}: ${shortName(d.newLows[0].title)}` : "";
  }
}

/** The product a story's link sticker opens: the rubric's own, or the day's best. */
function storyProduct(d: Digest, r: Rubric): DigestProduct | null {
  switch (r) {
    case "drop": return d.drop;
    case "gap": return d.gap;
    case "wait": return d.wait;
    case "newLows": return d.newLows[0] ?? null;
    default: return d.best[0] ?? null;
  }
}

export function packFor(c: Ctx, r: Rubric): Pack | null {
  const x = storyProduct(c.d, r);
  if (!x) return null;
  return {
    hook: hook(c, r),
    caption: { post: caption(c, r, "post"), reel: caption(c, r, "reel"), tiktok: caption(c, r, "tiktok") },
    story: { sticker: hook(c, r), linkRu: link(c, x, "ru", "story"), linkKk: link(c, x, "kk", "story") },
  };
}

export type { Ctx as TextCtx };
