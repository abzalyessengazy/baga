import { describe, expect, it } from "vitest";
import { afterFailedDelivery, isPermanentHttpStatus, isQuietHour, DELIVERY } from "./delivery";

describe("afterFailedDelivery", () => {
  it("retries a passing failure later and later, then gives up", () => {
    expect(afterFailedDelivery(1, false)).toEqual({ status: "queued", retryInMinutes: 5 });
    expect(afterFailedDelivery(2, false)).toEqual({ status: "queued", retryInMinutes: 30 });
    expect(afterFailedDelivery(4, false)).toEqual({ status: "queued", retryInMinutes: 360 });
    expect(afterFailedDelivery(DELIVERY.maxAttempts, false)).toEqual({ status: "failed" });
  });
  it("fails a permanent error at once", () => {
    expect(afterFailedDelivery(1, true)).toEqual({ status: "failed" });
  });
});

describe("isPermanentHttpStatus", () => {
  it("treats a bad request, a blocked bot or a rejected address as final, and rate limits or outages as passing", () => {
    for (const s of [400, 403, 404, 422]) expect(isPermanentHttpStatus(s)).toBe(true);
    for (const s of [408, 429, 500, 502, 503]) expect(isPermanentHttpStatus(s)).toBe(false);
  });
});

describe("isQuietHour", () => {
  it("is 22:00–08:00 Almaty (UTC+5)", () => {
    expect(isQuietHour(new Date("2026-11-20T16:59:00Z"))).toBe(false); // 21:59
    expect(isQuietHour(new Date("2026-11-20T17:00:00Z"))).toBe(true); // 22:00
    expect(isQuietHour(new Date("2026-11-20T23:45:00Z"))).toBe(true); // 04:45
    expect(isQuietHour(new Date("2026-11-21T02:59:00Z"))).toBe(true); // 07:59
    expect(isQuietHour(new Date("2026-11-21T03:00:00Z"))).toBe(false); // 08:00
  });
});
