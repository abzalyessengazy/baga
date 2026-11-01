/**
 * kaspi.kz/robots.txt (checked 1 Nov 2026): `Crawl-delay: 10`, `Visit-time: 0400-0845` (UTC).
 * The collector only runs inside this window and waits at least CRAWL_DELAY_MS between requests.
 */
export const KASPI_VISIT_WINDOW_UTC = { startMinute: 4 * 60, endMinute: 8 * 60 + 45 } as const;
export const KASPI_CRAWL_DELAY_MS = 10_000;

export const VISIT_WINDOW_MINUTES = KASPI_VISIT_WINDOW_UTC.endMinute - KASPI_VISIT_WINDOW_UTC.startMinute;

function minuteOfDayUtc(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
}

/** True while `now` is inside the visit window and at least `marginMs` remain before it closes. */
export function isInVisitWindow(now: Date, marginMs = 0): boolean {
  const m = minuteOfDayUtc(now);
  return m >= KASPI_VISIT_WINDOW_UTC.startMinute && m + marginMs / 60_000 < KASPI_VISIT_WINDOW_UTC.endMinute;
}

/** Milliseconds until the window next opens (0 if it is open now). */
export function msUntilVisitWindow(now: Date): number {
  if (isInVisitWindow(now)) return 0;
  let minutes = KASPI_VISIT_WINDOW_UTC.startMinute - minuteOfDayUtc(now);
  if (minutes < 0) minutes += 24 * 60;
  return Math.round(minutes * 60_000);
}

/** Kazakhstan has used one time zone, UTC+5, since 1 March 2024. */
const ALMATY_OFFSET_MINUTES = 5 * 60;

/**
 * For a request made at `now`: is the next visit window still today, or tomorrow, in Almaty local time?
 * The window (09:00–13:45 Almaty) falls on a single Almaty calendar day.
 */
export function nextVisitWindowDay(now: Date): "today" | "tomorrow" {
  const almatyMinute = (now.getUTCHours() * 60 + now.getUTCMinutes() + ALMATY_OFFSET_MINUTES) % (24 * 60);
  return almatyMinute < KASPI_VISIT_WINDOW_UTC.endMinute + ALMATY_OFFSET_MINUTES ? "today" : "tomorrow";
}
