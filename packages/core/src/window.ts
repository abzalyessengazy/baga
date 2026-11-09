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

/**
 * Days the collector stops early (UTC date → end minute), to leave the rest of Kaspi's Visit-time to a one-off
 * probe: two clients at once would break the 10 s Crawl-delay. None now. Last used 8 Nov 2026 ("2026-11-08": 8 * 60)
 * for the list-vs-sellers test (probe:pairs, run as a step after the collector in collect.yml).
 */
export const COLLECT_END_EXCEPTIONS_UTC: Readonly<Record<string, number>> = {};

/** Minute of the UTC day when the collection window closes on `now`'s day. */
export function collectEndMinute(now: Date): number {
  return COLLECT_END_EXCEPTIONS_UTC[now.toISOString().slice(0, 10)] ?? COLLECT_WINDOW_UTC.endMinute;
}

/** True while `now` is inside the collection window and at least `marginMs` remain before it closes. */
export function isInVisitWindow(now: Date, marginMs = 0): boolean {
  const m = minuteOfDayUtc(now);
  return m >= COLLECT_WINDOW_UTC.startMinute && m + marginMs / 60_000 < collectEndMinute(now);
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

/**
 * The latest Almaty day whose collection is over (docs/STATS.md, "Shift"): today once Kaspi's Visit-time has ended
 * (08:45 UTC = 13:45 Almaty), yesterday before that. Numbers of a run still in progress are never shown as a day.
 */
export function lastCompleteShiftDay(now: Date): string {
  return new Date(now.getTime() - KASPI_VISIT_WINDOW_UTC.endMinute * 60_000).toISOString().slice(0, 10);
}

/** Seconds until the next shift day completes (08:45 UTC): CDN copies of daily numbers should not outlive it. */
export function secondsUntilShiftEnds(now: Date): number {
  const end = KASPI_VISIT_WINDOW_UTC.endMinute * 60;
  const s = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  return s < end ? end - s : 86_400 - s + end;
}

/**
 * Manual checks (a visitor's own product, on request; DECISIONS.md 2026-11-09): never from 5 minutes before the
 * collector can start until 5 minutes after Kaspi's Visit-time ends (03:55–08:50 UTC): the daily collector and the
 * occasional probe after it (08:31–08:43) own those minutes, and inside the window the collector fetches a visitor's
 * product within minutes anyway. Two clients at once would break the 10 s Crawl-delay.
 */
export const MANUAL_BLACKOUT_UTC = { startMinute: KASPI_VISIT_WINDOW_UTC.startMinute - 5, endMinute: KASPI_VISIT_WINDOW_UTC.endMinute + 5 } as const;

export function isManualCheckTime(now: Date, marginMs = 0): boolean {
  const m = (t: Date) => t.getUTCHours() * 60 + t.getUTCMinutes() + t.getUTCSeconds() / 60;
  const inBlackout = (x: number) => x >= MANUAL_BLACKOUT_UTC.startMinute && x < MANUAL_BLACKOUT_UTC.endMinute;
  return !inBlackout(m(now)) && !inBlackout(m(new Date(now.getTime() + marginMs)));
}
