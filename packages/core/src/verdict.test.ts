import { describe, expect, it } from "vitest";
import { computeVerdict, percentile } from "./verdict";

const series = (prices: number[]) =>
  prices.map((price, i) => ({ day: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10), price }));

describe("percentile", () => {
  it("interpolates", () => {
    expect(percentile([100, 200, 300, 400, 500], 0.5)).toBe(300);
    expect(percentile([100, 200], 0.5)).toBe(150);
  });
});

describe("computeVerdict", () => {
  it("is insufficient under 14 observed days but still reports the min", () => {
    const v = computeVerdict(series([500, 480, 490]), 490);
    expect(v.kind).toBe("insufficient");
    expect(v.min).toBe(480);
    expect(v.minDay).toBe("2026-09-02");
    expect(v.observedDays).toBe(3);
  });

  it("is empty-safe", () => {
    expect(computeVerdict([], 1000).kind).toBe("insufficient");
  });

  const thirty = series(Array.from({ length: 30 }, (_, i) => 500_000 + (i % 10) * 10_000));

  it("low when at or below the 20th percentile", () => {
    const v = computeVerdict(thirty, 500_000);
    expect(v.kind).toBe("low");
    expect(v.cheaperThanShare).toBeGreaterThan(0.8);
  });
  it("typical in the middle", () => {
    expect(computeVerdict(thirty, 540_000).kind).toBe("typical");
  });
  it("high above the 70th percentile", () => {
    const v = computeVerdict(thirty, 600_000);
    expect(v.kind).toBe("high");
    expect(v.aboveMedianPct).toBeGreaterThan(0);
  });
  it("only uses the last 60 days", () => {
    const old = series([...Array.from({ length: 40 }, () => 100), ...Array.from({ length: 60 }, () => 1000)]);
    const v = computeVerdict(old, 1000);
    expect(v.windowDays).toBe(60);
    expect(v.min).toBe(1000);
  });
});
