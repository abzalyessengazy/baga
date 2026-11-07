import { describe, expect, it } from "vitest";
import { isInVisitWindow, lastCompleteShiftDay, msUntilVisitWindow, secondsUntilShiftEnds, nextVisitWindowDay, VISIT_WINDOW_MINUTES } from "./window";

const utc = (hhmm: string) => new Date(`2026-11-02T${hhmm}:00Z`);

describe("Collection window inside Kaspi's robots.txt Visit-time 0400-0845 UTC", () => {
  it("is open from 04:05 up to 08:30 UTC, keeping 5 and 15 minutes off Kaspi's edges", () => {
    expect(isInVisitWindow(utc("04:00"))).toBe(false);
    expect(isInVisitWindow(utc("04:04"))).toBe(false);
    expect(isInVisitWindow(utc("04:05"))).toBe(true);
    expect(isInVisitWindow(utc("08:29"))).toBe(true);
    expect(isInVisitWindow(utc("08:30"))).toBe(false);
    expect(isInVisitWindow(utc("08:44"))).toBe(false);
    expect(isInVisitWindow(utc("16:00"))).toBe(false); // 21:00 Almaty
  });
  it("closes early on a day listed for a probe, and only that day", () => {
    expect(isInVisitWindow(new Date("2026-11-08T07:59:00Z"))).toBe(true);
    expect(isInVisitWindow(new Date("2026-11-08T08:00:00Z"))).toBe(false);
    expect(isInVisitWindow(new Date("2026-11-08T07:59:30Z"), 60_000)).toBe(false);
    expect(isInVisitWindow(new Date("2026-11-09T08:29:00Z"))).toBe(true);
    expect(isInVisitWindow(new Date("2026-11-07T08:29:00Z"))).toBe(true);
  });
  it("keeps a safety margin before closing", () => {
    expect(isInVisitWindow(utc("08:29"), 30_000)).toBe(true);
    expect(isInVisitWindow(new Date("2026-11-02T08:29:40Z"), 30_000)).toBe(false);
  });
  it("says how long until it opens", () => {
    expect(msUntilVisitWindow(utc("03:50"))).toBe(15 * 60_000);
    expect(msUntilVisitWindow(utc("05:00"))).toBe(0);
    expect(msUntilVisitWindow(utc("09:05"))).toBe(19 * 3_600_000);
  });
  it("is 4 h 45 min long", () => {
    expect(VISIT_WINDOW_MINUTES).toBe(285);
  });
  it("tells a visitor whether the next window is today or tomorrow, in Almaty time", () => {
    expect(nextVisitWindowDay(utc("02:00"))).toBe("today");    // 07:00 Almaty, before the window
    expect(nextVisitWindowDay(utc("06:00"))).toBe("today");    // 11:00 Almaty, during the window
    expect(nextVisitWindowDay(utc("08:29"))).toBe("today");    // 13:29 Almaty, last minute
    expect(nextVisitWindowDay(utc("08:30"))).toBe("tomorrow"); // 13:30 Almaty, closed
    expect(nextVisitWindowDay(utc("17:00"))).toBe("tomorrow"); // 22:00 Almaty
    expect(nextVisitWindowDay(utc("19:30"))).toBe("today");    // 00:30 Almaty, already the next day
  });
});

describe("lastCompleteShiftDay", () => {
  it("is yesterday while today's run may still be going, today after 13:45 Almaty", () => {
    expect(lastCompleteShiftDay(new Date("2026-11-05T04:33:00Z"))).toBe("2026-11-04"); // 09:33 Almaty
    expect(lastCompleteShiftDay(new Date("2026-11-05T08:44:00Z"))).toBe("2026-11-04");
    expect(lastCompleteShiftDay(new Date("2026-11-05T08:45:00Z"))).toBe("2026-11-05"); // 13:45 Almaty
    expect(lastCompleteShiftDay(new Date("2026-11-05T20:00:00Z"))).toBe("2026-11-05"); // 01:00 Almaty, 6 Nov
    expect(lastCompleteShiftDay(new Date("2026-11-05T23:30:00Z"))).toBe("2026-11-05"); // 04:30 Almaty, 6 Nov
  });
});

describe("secondsUntilShiftEnds", () => {
  it("counts down to 08:45 UTC, today or tomorrow", () => {
    expect(secondsUntilShiftEnds(new Date("2026-11-05T08:15:00Z"))).toBe(1800);
    expect(secondsUntilShiftEnds(new Date("2026-11-05T08:45:00Z"))).toBe(86_400);
    expect(secondsUntilShiftEnds(new Date("2026-11-05T20:45:00Z"))).toBe(12 * 3600);
  });
});
