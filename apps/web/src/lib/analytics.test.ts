import { describe, expect, it } from "vitest";
import { landing } from "./analytics";

describe("landing", () => {
  it("names the kind of page, never the address", () => {
    expect(landing("/ru")).toEqual({ detail: "home" });
    expect(landing("/kk/")).toEqual({ detail: "home" });
    expect(landing("/ru/p/138771626")).toEqual({ detail: "product", externalId: "138771626" });
    expect(landing("/ru/black-friday")).toEqual({ detail: "black_friday" });
    expect(landing("/kk/drops")).toEqual({ detail: "drops" });
    expect(landing("/ru/%D0%B0")).toEqual({ detail: "other" });
  });
});
