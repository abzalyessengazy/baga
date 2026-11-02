/**
 * kaspi.kz/robots.txt (checked 1 Nov 2026): `Crawl-delay: 10`, `Visit-time: 0400-0845` (UTC).
 * The collector only runs inside it (with margins, COLLECT_WINDOW_UTC) and waits at least CRAWL_DELAY_MS between requests.
 */
export const KASPI_VISIT_WINDOW_UTC = { startMinute: 4 * 60, endMinute: 8 * 60 + 45 } as const;
export const KASPI_CRAWL_DELAY_MS = 10_000;

export const VISIT_WINDOW_MINUTES = KASPI_VISIT_WINDOW_UTC.endMinute - KASPI_VISIT_WINDOW_UTC.startMinute;

/**
 * Our own collection window sits inside Kaspi's with safety margins, so runner clock drift or a slow last
 * request never lands at the edges: 04:05–08:30 UTC (09:05–13:30 Almaty).
 */
export const COLLECT_WINDOW_UTC = {
  startMinute: KASPI_VISIT_WINDOW_UTC.startMinute + 5,
  endMinute: KASPI_VISIT_WINDOW_UTC.endMinute - 15,
} as const;

function minuteOfDayUtc(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
}

/** True while `now` is inside the collection window and at least `marginMs` remain before it closes. */
export function isInVisitWindow(now: Date, marginMs = 0): boolean {
  const m = minuteOfDayUtc(now);
  return m >= COLLECT_WINDOW_UTC.startMinute && m + marginMs / 60_000 < COLLECT_WINDOW_UTC.endMinute;
}

/** Milliseconds until the collection window next opens (0 if it is open now). */
export function msUntilVisitWindow(now: Date): number {
  if (isInVisitWindow(now)) return 0;
  let minutes = COLLECT_WINDOW_UTC.startMinute - minuteOfDayUtc(now);
  if (minutes < 0) minutes += 24 * 60;
  return Math.round(minutes * 60_000);
}

/** Kazakhstan has used one time zone, UTC+5, since 1 March 2024. */
const ALMATY_OFFSET_MINUTES = 5 * 60;

/**
 * For a request made at `now`: is the next visit window still today, or tomorrow, in Almaty local time?
 * The window (09:05–13:30 Almaty) falls on a single Almaty calendar day.
 */
export function nextVisitWindowDay(now: Date): "today" | "tomorrow" {
  const almatyMinute = (now.getUTCHours() * 60 + now.getUTCMinutes() + ALMATY_OFFSET_MINUTES) % (24 * 60);
  return almatyMinute < COLLECT_WINDOW_UTC.endMinute + ALMATY_OFFSET_MINUTES ? "today" : "tomorrow";
}
