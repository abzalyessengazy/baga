/**
 * An alert that goes out on a later Almaty day than its check (a retry, up to DELIVERY.maxAgeHours) says when the price
 * was seen: «19.11, 14:12» (the owner, 20 Nov 2026, after the alerts audit). Null when it goes out the same day.
 */
const day = (d: Date) => new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "Asia/Almaty" }).format(d);
const time = (d: Date) => new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Almaty" }).format(d);

export function lateCheck(checkedAt: Date | null | undefined, now = new Date()): string | null {
  if (!checkedAt || day(checkedAt) === day(now)) return null;
  return `${day(checkedAt)}, ${time(checkedAt)}`;
}
