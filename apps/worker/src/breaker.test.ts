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
  it("does not stop for a few responses we could not read (the run of 2 Nov: 3 of 14)", () => {
    const b = new CircuitBreaker();
    for (let i = 0; i < 11; i++) b.record(true);
    for (let i = 0; i < 3; i++) b.record(false, false, true);
    expect(b.openReason).toBeNull();
  });
  it("stops when most responses are unreadable (Kaspi changed its format)", () => {
    const b = new CircuitBreaker();
    for (let i = 0; i < 8; i++) b.record(true);
    for (let i = 0; i < 12; i++) b.record(false, false, true);
    expect(b.openReason).toMatch(/unreadable share/);
  });
});
