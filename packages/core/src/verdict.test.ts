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
  it("is insufficient under 3 observed days but still reports the min", () => {
    const v = computeVerdict(series([500, 480]), 490);
    expect(v.kind).toBe("insufficient");
    expect(v.min).toBe(480);
    expect(v.minDay).toBe("2026-09-02");
    expect(v.observedDays).toBe(2);
  });

  it("speaks from 3 days: at the lowest is a good price, far above the usual is high", () => {
    expect(computeVerdict(series([159_990, 175_000, 180_000]), 159_990)).toMatchObject({ kind: "low", atLow: true });
    expect(computeVerdict(series([160_000, 160_000, 165_000, 200_000]), 200_000).kind).toBe("high");
  });

  it("calls a price stable when every day stays within 2%", () => {
    expect(computeVerdict(series([69_890, 69_990, 70_500, 69_890, 70_000]), 70_100).kind).toBe("stable");
    expect(computeVerdict(series([69_890, 69_990, 75_000]), 70_100).kind).not.toBe("stable");
  });

  it("is not high a few tenge above the median", () => {
    expect(computeVerdict(series([100_000, 100_000, 100_000, 100_100, 120_000, 90_000]), 100_200).kind).toBe("typical");
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
  it("is not a good price at the usual price, nor far above a recent low (10 Nov 2026, DREAME H13 Pro)", () => {
    const vacuum = series([319_990, 169_990, 319_990, 306_190, 306_190, 306_190, 306_190, 306_190]);
    const v = computeVerdict(vacuum, 306_190);
    expect(v.kind).toBe("typical");
    expect(v.wasCheaper).toBe(true);
    expect(v.median).toBe(306_190);
  });
  it("is a good price clearly under the usual one, close to the lowest", () => {
    const v = computeVerdict(series([100_000, 100_000, 100_000, 100_000, 93_000, 92_000, 100_000, 100_000, 100_000, 100_000]), 93_000);
    expect(v.kind).toBe("low");
    expect(v.wasCheaper).toBe(false);
  });
  it("only uses the last 60 days", () => {
    const old = series([...Array.from({ length: 40 }, () => 100), ...Array.from({ length: 60 }, () => 1000)]);
    const v = computeVerdict(old, 1000);
    expect(v.windowDays).toBe(60);
    expect(v.min).toBe(1000);
    expect(v.kind).toBe("stable"); // the old 100s are outside the window
  });
});
