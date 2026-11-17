import { describe, expect, it } from "vitest";
import { makePass, validPass } from "./humanPass";

describe("human pass", () => {
  it("is valid for 30 minutes with the same secret", () => {
    const now = Date.UTC(2026, 10, 17, 10);
    const v = makePass(now, "s")!;
    expect(validPass(v, now + 29 * 60_000, "s")).toBe(true);
    expect(validPass(v, now + 31 * 60_000, "s")).toBe(false);
    expect(validPass(v, now, "other")).toBe(false);
  });
  it("refuses anything forged", () => {
    expect(validPass(undefined, Date.now(), "s")).toBe(false);
    expect(validPass("9999999999.abc", Date.now(), "s")).toBe(false);
    expect(validPass("pass", Date.now(), "s")).toBe(false);
  });
});
