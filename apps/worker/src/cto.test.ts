import { describe, expect, it } from "vitest";
import { numbersIn, unbackedNumbers } from "./cto";

describe("CTO note number check", () => {
  it("reads numbers with separators and percents", () => {
    expect(numbersIn("1 166 checks, 25% failed, 0.9 share, 1,646 products, 09:45")).toEqual(["1166", "25", "0.9", "1646", "9", "45"]);
  });
  it("accepts numbers that are in the data, dates included", () => {
    const input = JSON.stringify({ day: "2026-11-11", requests: 1166, aborted: ["failure share 25% over 12 checks"], at: "2026-11-12T09:45:00Z" });
    expect(unbackedNumbers("• Kaspi made 1 166 requests on 11 Nov; earlier run stopped at 25% over 12 checks (09:45).", input)).toEqual([]);
  });
  it("flags a number the data does not hold", () => {
    expect(unbackedNumbers("• About 70% of products are fresh.", JSON.stringify({ products: 1646, fresh3d: 1150 }))).toEqual(["70"]);
  });
});
