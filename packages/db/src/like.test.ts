import { describe, expect, it } from "vitest";
import { likePattern } from "./like";

describe("likePattern", () => {
  it("wraps a word in % for a contains-match", () => {
    expect(likePattern("iphone")).toBe("%iphone%");
  });
  it("escapes SQL wildcards and the escape character itself", () => {
    expect(likePattern("100%_off")).toBe("%100\\%\\_off%");
    expect(likePattern("a\\b")).toBe("%a\\\\b%");
  });
});
