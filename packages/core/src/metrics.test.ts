import { describe, expect, it } from "vitest";
import { pasteOutcome, personReliable, PASTE_OUTCOMES } from "./metrics";

describe("personReliable", () => {
  it("is true only for periods starting on or after the first full day of browser ids", () => {
    expect(personReliable("2026-11-11")).toBe(false);
    expect(personReliable("2026-11-05")).toBe(false);
    expect(personReliable("2026-11-12")).toBe(true);
    expect(personReliable("2026-12-01")).toBe(true);
  });
});

describe("pasteOutcome", () => {
  it("maps every resolve answer to a category", () => {
    expect(pasteOutcome({ productId: "123456" })).toBe("ok");
    expect(pasteOutcome({ pendingLink: "abcd" })).toBe("queued");
    expect(pasteOutcome({ error: "not_a_url" })).toBe("not_a_url");
    expect(pasteOutcome({ error: "not_kaspi" })).toBe("not_kaspi");
    expect(pasteOutcome({ error: "not_a_product" })).toBe("not_a_product");
    expect(pasteOutcome({ error: "short_link" })).toBe("short_link_failed");
    expect(pasteOutcome({ error: "check_failed" })).toBe("check_failed");
    expect(pasteOutcome({ error: "check_blocked" })).toBe("check_failed");
    expect(pasteOutcome({ error: "too_many" })).toBe("rate_limited");
    expect(pasteOutcome({ error: "something new" })).toBe("unknown");
    expect(pasteOutcome({})).toBe("unknown");
    expect(pasteOutcome("network")).toBe("network");
  });
  it("only produces labels the event endpoint accepts", () => {
    for (const o of PASTE_OUTCOMES) expect(o).toMatch(/^[a-z_]{1,32}$/);
  });
});
