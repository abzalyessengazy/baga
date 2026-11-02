import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./email";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Abzal.Y@Gmail.COM ")).toBe("abzal.y@gmail.com");
  });
  it("accepts plus tags and subdomains", () => {
    expect(normalizeEmail("me+baga@mail.example.kz")).toBe("me+baga@mail.example.kz");
  });
  it("rejects things that are not an address", () => {
    for (const v of ["", "abc", "a@b", "a@b.c", "@mail.kz", "me@", "me@@mail.kz", "me @mail.kz", "me@mail..kz",
      ".me@mail.kz", "me.@mail.kz", "m..e@mail.kz", "me@-mail.kz", "me@mail.kz.", "<me@mail.kz>", "me@mail.kz\nBcc: x@y.kz", 42, null]) {
      expect(normalizeEmail(v), String(v)).toBeNull();
    }
  });
  it("rejects non-ASCII addresses", () => {
    expect(normalizeEmail("баға@mail.kz")).toBeNull();
    expect(normalizeEmail("me@баға.қаз")).toBeNull();
  });
  it("rejects over-long addresses", () => {
    expect(normalizeEmail(`${"a".repeat(65)}@mail.kz`)).toBeNull();
    expect(normalizeEmail(`me@${"a".repeat(250)}.kz`)).toBeNull();
  });
});
