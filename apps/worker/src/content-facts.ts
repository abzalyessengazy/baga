import { formatTenge } from "@baga/core";
import type { Market } from "@baga/db";

/**
 * What a post draft may say (DECISIONS.md, 2026-11-12 "Content agent"): chosen in code from the home page's own
 * market numbers, so the writer only words them. One theme per day: Monday the week's best drops, Wednesday the find
 * of the day, Friday one product's seller spread; the next theme when a day's has nothing to show.
 */
export type Theme = "week" | "pick" | "spread";

export interface FactProduct {
  /** Kaspi's full name: a post names the product exactly (shortTitle can drop a category word before a model number). */
  name: string; nameKk: string | null;
  /** Tenge, and the same as shown on the site. */
  price: number; priceText: string;
  /** week/pick: the price a week ago (rule W); spread: the dearest seller. */
  ref: number; refText: string;
  /** week/pick: percent cheaper than a week ago; spread: the gap between the cheapest and the dearest seller. */
  pct: number; gapText?: string;
  sellers: number;
  /** Our product page with utm tags (ru and kk), and its preview card picture (no Kaspi image). */
  linkRu: string; linkKk: string; card: string;
}

export interface Facts { theme: Theme; day: string | null; products: FactProduct[] }

const THEMES: Record<number, Theme[]> = { 1: ["week", "pick", "spread"], 3: ["pick", "week", "spread"], 5: ["spread", "pick", "week"] };

/** The theme order for a day of the week (Almaty); other days fall back to Wednesday's order. */
export const themesFor = (weekday: number): Theme[] => THEMES[weekday] ?? THEMES[3]!;

/** A tagged link to our product page: Instagram by default (the owner swaps the source for another platform), the campaign names the day. */
export function postLink(site: string, locale: "ru" | "kk", externalId: string, campaign: string, source = "instagram"): string {
  return `${site}/${locale}/p/${externalId}?utm_source=${source}&utm_medium=post&utm_campaign=${campaign}`;
}

export function buildFacts(m: Market, weekday: number, site: string, campaign: string): Facts | null {
  const link = (id: string) => ({
    linkRu: postLink(site, "ru", id, campaign), linkKk: postLink(site, "kk", id, campaign), card: `${site}/ru/p/${id}/opengraph-image/card`,
  });
  for (const theme of themesFor(weekday)) {
    if (theme === "week" || theme === "pick") {
      // The finds of the day: the week's best drops without a seller to check (MarketPick).
      const picks = theme === "week" ? m.picks.filter((p) => p.note?.kind !== "check").slice(0, 3) : m.picks.filter((p) => p.note?.kind !== "check").slice(0, 1);
      if (theme === "week" ? picks.length < 2 : picks.length < 1) continue;
      return {
        theme, day: m.day,
        products: picks.map((p) => ({
          name: p.title, nameKk: p.titleKk,
          price: p.price, priceText: formatTenge(p.price), ref: p.ref, refText: formatTenge(p.ref), pct: Math.abs(p.pct), sellers: p.sellers,
          ...link(p.externalId),
        })),
      };
    }
    // The widest spread where the cheapest offer is at most half below the dearest: a cheaper one is the seller
    // table's «проверьте продавца» case, which a post must not send people to (12 Nov: a humidifier at −70%).
    const s = m.spread.top.find((x) => x.sellers >= 3 && x.lo * 2 >= x.hi);
    if (!s) continue;
    return {
      theme, day: m.day,
      products: [{
        name: s.title, nameKk: s.titleKk,
        price: s.lo, priceText: formatTenge(s.lo), ref: s.hi, refText: formatTenge(s.hi),
        pct: Math.round(((s.hi - s.lo) / s.hi) * 100), gapText: formatTenge(s.hi - s.lo), sellers: s.sellers,
        ...link(s.externalId),
      }],
    };
  }
  return null;
}
