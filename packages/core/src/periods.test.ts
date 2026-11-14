import { describe, expect, it } from "vitest";
import { isPeriodKey, mondayOf, periodRange } from "./periods";

describe("periodRange", () => {
  const today = "2026-11-14"; // a Saturday
  it("today and yesterday are single whole days", () => {
    expect(periodRange("today", today)).toMatchObject({ from: today, to: today, prev: { from: "2026-11-13", to: "2026-11-13" }, running: true, upTo: today });
    expect(periodRange("yesterday", today)).toMatchObject({ from: "2026-11-13", to: "2026-11-13", running: false, upTo: "2026-11-13" });
  });
  it("weeks run Monday to Sunday", () => {
    expect(periodRange("week", today)).toMatchObject({ from: "2026-11-09", to: "2026-11-15", prev: { from: "2026-11-02", to: "2026-11-08" }, upTo: today });
    expect(periodRange("lastWeek", today)).toMatchObject({ from: "2026-11-02", to: "2026-11-08", running: false });
    expect(mondayOf("2026-11-16")).toBe("2026-11-16");
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
  });
  it("months and years are calendar ones, across a year end", () => {
    expect(periodRange("month", today)).toMatchObject({ from: "2026-11-01", to: "2026-11-30", prev: { from: "2026-10-01", to: "2026-10-31" } });
    expect(periodRange("lastMonth", "2027-01-05")).toMatchObject({ from: "2026-12-01", to: "2026-12-31", prev: { from: "2026-11-01", to: "2026-11-30" } });
    expect(periodRange("month", "2028-02-10").to).toBe("2028-02-29");
    expect(periodRange("year", today)).toMatchObject({ from: "2026-01-01", to: "2026-12-31", bucket: "month", prev: { from: "2025-01-01" } });
  });
  it("knows its keys", () => {
    expect(isPeriodKey("week")).toBe(true);
    expect(isPeriodKey("7")).toBe(false);
  });
});
