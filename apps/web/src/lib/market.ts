import type { Market } from "@baga/db";
import { remembered } from "./remembered";

/** One /api/market request, shared by the hero receipt and the Z-report slips and kept across page changes. */
const market = remembered<Market>("/api/market");
export const loadMarket = market.load;
export const cachedMarket = market.peek;

/** A price move from /api/stats: the earlier daily low, the current one. */
export type StatsDrop = { externalId: string; title: string; titleKk: string | null; imageUrl: string | null; from: number; to: number; pct: number; at: string };
export type StatsItem = { externalId: string; title: string; titleKk: string | null; imageUrl: string | null; price: number | null; at: string };
export type StatsMoves = { drops: StatsDrop[]; rises: StatsDrop[] };
export type StatsShop = { externalId: string; name: string; rating: number; reviews: number; products: number };
/** /api/stats as the browser gets it (dates as strings). Lists added on 13 Nov may be missing in a cached answer. */
export type Stats = {
  products: number; sellers: number; shiftDay: string | null; shiftRun?: { startedAt: string; finishedAt: string } | null; checks: number; changes: number; drops: number; rises: number; alertsSent: number; watchers: number;
  lastRun: { startedAt: string; finishedAt: string } | null;
  days: { day: string; checks: number; drops: number }[];
  moves: { day: StatsMoves; week: StatsMoves };
  mostTracked: StatsItem[];
  newest: StatsItem[];
  tenge?: StatsMoves;
  stable?: (StatsItem & { days: number; since: string })[];
  shops?: { top: StatsShop[]; low: StatsShop[] };
};
const stats = remembered<Stats>("/api/stats");
export const loadStats = stats.load;
export const cachedStats = stats.peek;

export type BoardRow = { tag: string; rank: number; nickname: string | null; avatar: string | null; tracked: number; total: number; potential: number; saved: number };
/** The leaderboard, reloaded after a minute (a new nickname should show up soon). */
const board = remembered<{ rows: BoardRow[]; total: number }>("/api/board", 60_000);
export const loadBoard = board.load;
