import type postgres from "postgres";
import { computeVerdict, priceNote, type PriceNote, type VerdictKind } from "@baga/core";
import { getDailyLows } from "./queries";
import { getMarket, MARKET_CONFIG } from "./market";
import { weekMovers, type Mover } from "./movers";

/**
 * The day's numbers for the owner's «Чек дня» agent (DECISIONS.md, 2026-11-13 "Digest feed"): the playbook's rubrics
 * computed with the site's own rules, so a post never says what the site contradicts (13 Nov: the agent's first issue
 * listed a shaver that was out of stock by morning and an iPad "drop" that had turned into a rise).
 *
 * Every product listed is in stock, priced and checked on `day`; its cheapest offer is not one the seller table marks
 * «проверьте продавца»; prices are our observed lows; "was" is rule W (the price a week ago that held two days), never
 * Kaspi's crossed-out price. Read-only.
 */
export const DIGEST_RULES = {
  best: 5, bestMinPrice: 5_000,
  waitMinPrice: 20_000,
  /** A new low needs this many observed days before it (the playbook: 14). */
  newLowMinDays: 14, newLows: 5,
  /** The cheapest offer this many percent or more below the next one: the price rests on one seller (`oneSeller`). */
  oneSellerPct: 10,
  candidates: 80,
} as const;

export interface DigestProduct {
  externalId: string; title: string; titleKk: string | null; category: string | null;
  /** The product's photo as the site shows it (Kaspi's image server; the caller loads it, our server never fetches it). */
  imageUrl: string | null;
  /** Our lowest observed offer now, tenge. */
  price: number;
  sellers: number;
  checkedAt: string;
  /** Days with at least one observation, and the first of them (YYYY-MM-DD): «за N дней наблюдений». */
  observedDays: number; firstObserved: string;
  /** The current price is below every earlier daily low we observed. */
  lowestSeen: boolean;
  /** The cheapest offer is far below the others from an established shop ("fact"); never "check" here. */
  note: PriceNote;
  /** The product page's verdict for this price (computeVerdict on our daily lows): the only source for a verdict stamp. */
  verdict: VerdictKind;
  /** The shop with the cheapest offer, and the next-cheapest offer (null with one seller). */
  cheapestSeller: string | null; nextPrice: number | null;
  /**
   * The price rests on one seller: the only offer, or DIGEST_RULES.oneSellerPct below the next one. Seller lists
   * differ by city (13 Nov: a MacBook at 712 489 ₸ from one Almaty seller; elsewhere Kaspi started at 827 790 ₸), so
   * a post should name the seller and say the check was in Almaty.
   */
  oneSeller: boolean;
}
export interface DigestMove extends DigestProduct { was: number; pct: number; diff: number }
export interface DigestGap extends DigestProduct { hi: number; diff: number; pct: number }

export interface Digest {
  /** Almaty today, and the day the numbers describe (the latest check day). */
  date: string; day: string | null;
  /** Offers are read for this city (CLAUDE.md rule 7); other cities may list other sellers. */
  city: string;
  /** `day` is today and its check has ended: the numbers will not change again today. */
  complete: boolean;
  live: boolean; asOf: string | null;
  market: { products: number; sellers: number; checked: number; compared: number; down: number; up: number; spreadMedianPct: number | null };
  /** Бүгінгі үздік / Лучшее сегодня: biggest % drops vs a week ago, one per category. */
  best: DigestMove[];
  /** Күннің құлдырауы / Падение дня: the biggest drop in tenge. */
  drop: DigestMove | null;
  /** Артық төлемеңіз / Не переплатите: the widest seller gap (offers above twice the median left out). */
  gap: DigestGap | null;
  /** Асықпаңыз / Подождите: the biggest % rise vs a week ago. */
  wait: DigestMove | null;
  /** Жаңа минимум / Новый минимум: below every earlier daily low, with DIGEST_RULES.newLowMinDays days before. */
  newLows: DigestProduct[];
}

/** One product per category, in the given order. */
export function onePerCategory<T extends { category: string | null; externalId: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((x) => {
    const k = x.category ?? `#${x.externalId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The biggest drop in tenge; ties go to the bigger percent. */
export function biggestDrop<T extends { diff: number; pct: number }>(items: T[]): T | null {
  return [...items].sort((a, b) => b.diff - a.diff || a.pct - b.pct)[0] ?? null;
}

interface Facts {
  id: number; category: string | null; observedDays: number; firstObserved: string; lowestSeen: boolean;
  prices: number[]; rating: number | null; reviews: number | null; seller: string | null;
  /** The latest check: its Almaty day (YYYY-MM-DD) and the moment. */
  lastChecked: string; lastCheckedAt: Date;
}

/** What every listed product needs: category, history length, whether today is its lowest, and its offers. */
async function factsFor(sql: postgres.Sql, ids: string[]): Promise<Map<string, Facts>> {
  if (!ids.length) return new Map();
  const rows = await sql<(Facts & { externalId: string; day: string })[]>`
    with p as (select id, external_id, category_path from products where marketplace_id = 1 and external_id = any(${ids})),
    d as (
      select o.product_id, (o.observed_at at time zone 'Asia/Almaty')::date as day, min(o.min_price) as low
      from price_observations o join p on p.id = o.product_id where o.min_price is not null group by 1, 2),
    h as (
      select product_id, count(*)::int as days, to_char(min(day), 'YYYY-MM-DD') as first,
             max(day) as last_day
      from d group by 1),
    earlier as (
      select d.product_id, min(d.low) as low from d join h on h.product_id = d.product_id where d.day < h.last_day group by 1),
    o as (
      select o.product_id, array_agg(o.price order by o.price, se.id) as prices,
             (array_agg(se.rating order by o.price, se.id))[1] as rating, (array_agg(se.reviews order by o.price, se.id))[1] as reviews,
             (array_agg(se.name order by o.price, se.id))[1] as seller
      from offers_current o join sellers se on se.id = o.seller_id join p on p.id = o.product_id group by 1)
    select p.id::int as id, p.external_id as "externalId", p.category_path[array_length(p.category_path, 1)] as category,
           coalesce(h.days, 0) as "observedDays", h.first as "firstObserved",
           (e.low is not null and s.current_min_price < e.low) as "lowestSeen",
           coalesce(o.prices, '{}') as prices, o.rating, o.reviews, o.seller,
           to_char((s.last_checked_at at time zone 'Asia/Almaty')::date, 'YYYY-MM-DD') as "lastChecked", s.last_checked_at as "lastCheckedAt"
    from p join product_state s on s.product_id = p.id
    left join h on h.product_id = p.id left join earlier e on e.product_id = p.id left join o on o.product_id = p.id`;
  return new Map(rows.map((r) => [r.externalId, r]));
}

/** The next-cheapest offer, and whether the cheapest stands alone: the only one, or `pct`% or more below the next. */
export function sellerSpread(prices: number[], pct: number): { nextPrice: number | null; oneSeller: boolean } {
  const [lo, next] = [...prices].sort((a, b) => a - b);
  if (lo === undefined) return { nextPrice: null, oneSeller: false };
  if (next === undefined) return { nextPrice: null, oneSeller: true };
  return { nextPrice: next, oneSeller: lo <= next * (1 - pct / 100) };
}

/** The cheapest offer's note against the others (the seller table's rule). */
const cheapestNote = (f: Facts): PriceNote =>
  f.prices.length >= 2 ? priceNote(f.prices[0]!, f.prices.slice(1), f.rating, f.reviews) : null;

export async function getDigest(sql: postgres.Sql, now = new Date()): Promise<Digest> {
  const R = DIGEST_RULES;
  const m = await getMarket(sql, now);
  const date = new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
  const day = m.day;
  const downs = await weekMovers(sql, "down", R.candidates);
  const ups = await weekMovers(sql, "up", R.candidates);
  const lowIds = day ? await sql<{ externalId: string; title: string; titleKk: string | null; imageUrl: string | null; price: number; sellers: number }[]>`
    with d as (
      select product_id, (observed_at at time zone 'Asia/Almaty')::date as day, min(min_price) as p
      from price_observations where min_price is not null
        and observed_at < (${day}::date + 1)::timestamp at time zone 'Asia/Almaty' group by 1, 2),
    r as (
      select product_id, day, p, row_number() over (w order by day desc) as rn, count(*) over w as days,
             min(p) over (w order by day rows between unbounded preceding and 1 preceding) as before_low
      from d window w as (partition by product_id))
    select pr.external_id as "externalId", pr.title, pr.title_kk as "titleKk", pr.image_url as "imageUrl", s.current_min_price as price,
           coalesce(s.offer_count, 0) as sellers
    from r join products pr on pr.id = r.product_id
    join product_state s on s.product_id = pr.id
    where r.rn = 1 and r.day = ${day}::date and r.days > ${R.newLowMinDays} and r.p < r.before_low
      and pr.status = 'active' and s.in_stock and s.current_min_price = r.p
    order by (r.before_low - r.p)::numeric / r.before_low desc limit ${R.candidates}` : [];
  const gaps = m.spread.top;
  const facts = await factsFor(sql, [...new Set([...downs, ...ups].map((x) => x.externalId).concat(lowIds.map((x) => x.externalId), gaps.map((g) => g.externalId)))]);

  // Listed only when checked on the day the numbers describe and the cheapest offer needs no seller check.
  const usable = (id: string) => {
    const f = facts.get(id);
    return f && day && f.lastChecked === day && cheapestNote(f)?.kind !== "check" ? f : null;
  };
  const product = (x: { externalId: string; title: string; titleKk: string | null; imageUrl: string | null }, price: number, sellers: number, f: Facts): DigestProduct => ({
    externalId: x.externalId, title: x.title, titleKk: x.titleKk, category: f.category, imageUrl: x.imageUrl,
    price, sellers, checkedAt: new Date(f.lastCheckedAt).toISOString(),
    observedDays: f.observedDays, firstObserved: f.firstObserved, lowestSeen: f.lowestSeen, note: cheapestNote(f), verdict: "insufficient",
    ...sellerSpread(f.prices, R.oneSellerPct), cheapestSeller: f.seller,
  });
  const move = (x: Mover): DigestMove | null => {
    const f = usable(x.externalId);
    if (!f) return null;
    return { ...product(x, x.now, x.offerCount, f), was: x.was, pct: x.pct, diff: Math.abs(x.was - x.now) };
  };

  const drops = downs.filter((x) => x.now >= R.bestMinPrice).map(move).filter((x): x is DigestMove => x !== null);
  const rises = ups.filter((x) => x.now >= R.waitMinPrice).map(move).filter((x): x is DigestMove => x !== null);
  const gap = (() => {
    for (const g of gaps) {
      const f = usable(g.externalId);
      if (!f || g.lo < MARKET_CONFIG.spreadMinPrice) continue;
      return { ...product(g, g.lo, g.sellers, f), hi: g.hi, diff: g.hi - g.lo, pct: Math.round(((g.hi - g.lo) * 100) / g.lo) };
    }
    return null;
  })();
  const lowsList = lowIds.flatMap((x) => {
    const f = usable(x.externalId);
    return f ? [product(x, x.price, x.sellers, f)] : [];
  });
  const best = onePerCategory(drops).slice(0, R.best);
  const drop = biggestDrop(drops.filter((x) => !best.some((b) => b.externalId === x.externalId))) ?? biggestDrop(drops);
  const wait = rises[0] ?? null;
  const newLows = lowsList.slice(0, R.newLows);
  // The product page's verdict, for the products listed only (one daily-lows read each).
  for (const x of [...best, drop, gap, wait, ...newLows]) {
    if (!x) continue;
    const f = facts.get(x.externalId)!;
    x.verdict = computeVerdict(await getDailyLows(sql, f.id), x.price).kind;
  }
  return {
    date, day, city: "Алматы", complete: !!day && day === date && !m.live && m.todayCheck === null,
    live: m.live, asOf: m.asOf,
    market: { products: m.catalog.products, sellers: m.catalog.sellers, checked: m.checked, compared: m.compared, down: m.down, up: m.up, spreadMedianPct: m.spread.medianPct },
    // «Падение дня» is a different product from the % list where there is one, so the two drop rubrics show two.
    best, drop, gap, wait, newLows,
  };
}
