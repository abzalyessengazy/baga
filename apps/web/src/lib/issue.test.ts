import { describe, expect, it } from "vitest";
import { issueOf } from "./issue";

describe("issueOf", () => {
  it("numbers «Чек дня» from № 001 on 13 Nov 2026", () => {
    expect(issueOf("2026-11-13")).toEqual({ number: 1, label: "№ 001", campaign: "chek_001" });
    expect(issueOf("2026-11-14")).toEqual({ number: 2, label: "№ 002", campaign: "chek_002" });
    expect(issueOf("2027-01-01").label).toBe("№ 050");
    expect(issueOf("2026-11-01").number).toBe(1);
  });
});
