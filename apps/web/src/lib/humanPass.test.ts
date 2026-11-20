import { describe, expect, it } from "vitest";
import { makePass, validPass } from "./humanPass";

describe("human pass", () => {
  it("is valid for 30 minutes with the same secret and IP", () => {
    const now = Date.UTC(2026, 10, 17, 10);
    const v = makePass("1.2.3.4", now, "s")!;
    expect(validPass(v, "1.2.3.4", now + 29 * 60_000, "s")).toBe(true);
    expect(validPass(v, "1.2.3.4", now + 31 * 60_000, "s")).toBe(false);
    expect(validPass(v, "1.2.3.4", now, "other")).toBe(false);
  });
  it("does not work from another IP (a copied cookie)", () => {
    const now = Date.UTC(2026, 10, 17, 10);
    const v = makePass("1.2.3.4", now, "s")!;
    expect(validPass(v, "5.6.7.8", now, "s")).toBe(false);
  });
  it("refuses anything forged", () => {
    expect(validPass(undefined, "1.2.3.4", Date.now(), "s")).toBe(false);
    expect(validPass("9999999999.abc", "1.2.3.4", Date.now(), "s")).toBe(false);
    expect(validPass("pass", "1.2.3.4", Date.now(), "s")).toBe(false);
  });
});
