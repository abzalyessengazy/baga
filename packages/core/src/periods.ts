/**
 * Calendar periods for the owner's analytics (the owner, 14 Nov 2026: «today means 00:00 till 23:59 today; this week
 * Monday 00:00 till Sunday 23:59; last week the same way; the same for month and year»). Days are Almaty days; a
 * period is whole days `from`..`to` (YYYY-MM-DD, inclusive). A current period runs to its natural end (Sunday, the
 * month's last day, 31 Dec): what has not happened yet is simply not counted. `prev` is the period of the same kind
 * just before (yesterday, last week, last month, last year). Pure date math, no I/O.
 */
export const PERIOD_KEYS = ["today", "yesterday", "week", "lastWeek", "month", "lastMonth", "year"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];
export interface DayRange { from: string; to: string }
export interface Period extends DayRange {
  key: PeriodKey;
  /** The same kind of period just before. */
  prev: DayRange;
  /** Whether the period is still running (today falls inside it). */
  running: boolean;
  /** The last day that has data so far: `to`, or today while running. */
  upTo: string;
  /** How the daily chart groups days: one bar per day, or per month for a year. */
  bucket: "day" | "month";
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
export const addDays = (s: string, n: number) => iso(new Date(parse(s).getTime() + n * 86_400_000));
/** Monday of the ISO week holding `s`. */
export const mondayOf = (s: string) => addDays(s, -((parse(s).getUTCDay() + 6) % 7));
const monthStart = (y: number, m: number) => iso(new Date(Date.UTC(y, m, 1)));
const monthRange = (y: number, m: number): DayRange => ({ from: monthStart(y, m), to: addDays(monthStart(y, m + 1), -1) });
const weekRange = (monday: string): DayRange => ({ from: monday, to: addDays(monday, 6) });
const dayRange = (d: string): DayRange => ({ from: d, to: d });

/** The period `key` as seen on `today` (YYYY-MM-DD, Almaty). */
export function periodRange(key: PeriodKey, today: string): Period {
  const t = parse(today), y = t.getUTCFullYear(), m = t.getUTCMonth();
  let cur: DayRange, prev: DayRange;
  switch (key) {
    case "today": cur = dayRange(today); prev = dayRange(addDays(today, -1)); break;
    case "yesterday": cur = dayRange(addDays(today, -1)); prev = dayRange(addDays(today, -2)); break;
    case "week": cur = weekRange(mondayOf(today)); prev = weekRange(addDays(mondayOf(today), -7)); break;
    case "lastWeek": cur = weekRange(addDays(mondayOf(today), -7)); prev = weekRange(addDays(mondayOf(today), -14)); break;
    case "month": cur = monthRange(y, m); prev = monthRange(y, m - 1); break;
    case "lastMonth": cur = monthRange(y, m - 1); prev = monthRange(y, m - 2); break;
    case "year": cur = { from: `${y}-01-01`, to: `${y}-12-31` }; prev = { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }; break;
  }
  const running = cur.from <= today && today <= cur.to;
  return { key, ...cur, prev, running, upTo: running ? today : cur.to, bucket: key === "year" ? "month" : "day" };
}

export const isPeriodKey = (s: string | undefined): s is PeriodKey => !!s && (PERIOD_KEYS as readonly string[]).includes(s);
