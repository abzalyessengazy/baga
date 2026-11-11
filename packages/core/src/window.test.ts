import { describe, expect, it } from "vitest";
import { isInVisitWindow, isInStoreWindow, isManualCheckTime, lastCompleteShiftDay, msUntilVisitWindow, secondsUntilShiftEnds, nextVisitWindowDay, VISIT_WINDOW_MINUTES } from "./window";

const utc = (hhmm: string) => new Date(`2026-11-02T${hhmm}:00Z`);

describe("Collection window inside Kaspi's robots.txt Visit-time 0400-0845 UTC", () => {
  it("is open from 04:01 up to 08:42 UTC, keeping 1 and 3 minutes off Kaspi's edges", () => {
    expect(isInVisitWindow(utc("04:00"))).toBe(false);
    expect(isInVisitWindow(utc("04:01"))).toBe(true);
    expect(isInVisitWindow(utc("08:41"))).toBe(true);
    expect(isInVisitWindow(utc("08:42"))).toBe(false);
    expect(isInVisitWindow(utc("08:44"))).toBe(false);
    expect(isInVisitWindow(utc("16:00"))).toBe(false); // 21:00 Almaty
  });
  it("has no early-stop days left after the 11 Nov probe", () => {
    expect(isInVisitWindow(new Date("2026-11-12T08:31:00Z"))).toBe(true);
    expect(isInVisitWindow(new Date("2026-11-13T08:41:00Z"))).toBe(true);
  });
  it("keeps a safety margin before closing", () => {
    expect(isInVisitWindow(utc("08:41"), 30_000)).toBe(true);
    expect(isInVisitWindow(new Date("2026-11-02T08:41:40Z"), 30_000)).toBe(false);
  });
  it("says how long until it opens", () => {
    expect(msUntilVisitWindow(utc("03:50"))).toBe(11 * 60_000);
    expect(msUntilVisitWindow(utc("05:00"))).toBe(0);
    expect(msUntilVisitWindow(utc("09:01"))).toBe(19 * 3_600_000);
  });
  it("is 4 h 45 min long", () => {
    expect(VISIT_WINDOW_MINUTES).toBe(285);
  });
  it("tells a visitor whether the next window is today or tomorrow, in Almaty time", () => {
    expect(nextVisitWindowDay(utc("02:00"))).toBe("today");    // 07:00 Almaty, before the window
    expect(nextVisitWindowDay(utc("06:00"))).toBe("today");    // 11:00 Almaty, during the window
    expect(nextVisitWindowDay(utc("08:41"))).toBe("today");    // 13:41 Almaty, last minute
    expect(nextVisitWindowDay(utc("08:42"))).toBe("tomorrow"); // 13:42 Almaty, closed
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

describe("manual checks (a visitor's own product, 9 Nov 2026)", () => {
  it("never from 03:55 to 08:50 UTC: the collector and the probe own those minutes", () => {
    expect(isManualCheckTime(utc("03:54"))).toBe(true);
    expect(isManualCheckTime(utc("03:55"))).toBe(false);
    expect(isManualCheckTime(utc("06:00"))).toBe(false);
    expect(isManualCheckTime(utc("08:49"))).toBe(false);
    expect(isManualCheckTime(utc("08:50"))).toBe(true);
    expect(isManualCheckTime(utc("20:00"))).toBe(true); // 01:00 Almaty
  });
  it("stops starting a check that could run into the blackout", () => {
    expect(isManualCheckTime(utc("03:54"), 60_000)).toBe(false);
    expect(isManualCheckTime(utc("03:53"), 60_000)).toBe(true);
  });
});

describe("other stores' window (Technodom, 10 Nov 2026)", () => {
  it("runs from 08:46 UTC across midnight to 03:50 UTC, never in Kaspi's Visit-time", () => {
    expect(isInStoreWindow(utc("08:45"))).toBe(false);
    expect(isInStoreWindow(utc("08:46"))).toBe(true);
    expect(isInStoreWindow(utc("20:54"))).toBe(true); // a late GitHub trigger on 9 Nov
    expect(isInStoreWindow(utc("23:59"))).toBe(true);
    expect(isInStoreWindow(utc("00:30"))).toBe(true);
    expect(isInStoreWindow(utc("03:49"))).toBe(true);
    expect(isInStoreWindow(utc("03:50"))).toBe(false);
    expect(isInStoreWindow(utc("06:00"))).toBe(false);
  });
  it("does not start a request that would run past 03:50", () => {
    expect(isInStoreWindow(utc("03:49"), 60_000)).toBe(false);
    expect(isInStoreWindow(utc("23:59"), 60_000)).toBe(true);
  });
});
