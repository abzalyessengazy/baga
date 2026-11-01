import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "./breaker";

describe("CircuitBreaker", () => {
  it("opens on repeated blocking responses", () => {
    const b = new CircuitBreaker();
    b.record(false, true);
    expect(b.openReason).toBeNull();
    b.record(false, true);
    expect(b.openReason).toMatch(/blocked/);
  });
  it("opens when more than 20% fail after 10 checks", () => {
    const b = new CircuitBreaker();
    for (let i = 0; i < 7; i++) b.record(true);
    for (let i = 0; i < 3; i++) b.record(false);
    expect(b.openReason).toMatch(/failure share/);
  });
  it("stays closed on a healthy run", () => {
    const b = new CircuitBreaker();
    for (let i = 0; i < 50; i++) b.record(i % 20 !== 0);
    expect(b.openReason).toBeNull();
  });
});
