import { describe, expect, it } from "vitest";
import { dayIndex, pickOrder, PICK } from "./pick";

const c = (id: string, pct: number, now = 50_000) => ({ externalId: id, now, pct });
const week = [c("top", -45), c("b", -40), c("c", -30), c("d", -20), c("e", -15), c("f", -12), c("g", -11)];
const days = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"];

describe("pickOrder", () => {
  it("rotates through the next best week drops, a different one each day", () => {
    const firsts = days.map((d) => pickOrder(week, d)[0]!.externalId);
    expect(new Set(firsts).size).toBe(PICK.rotate);
    expect(firsts.every((id) => ["b", "c", "d", "e", "f"].includes(id))).toBe(true);
    expect(pickOrder(week, "2026-11-10")).toHaveLength(PICK.rotate);
  });
  it("never picks the week's biggest drop or a product already shown", () => {
    for (const d of days) {
      const ids = pickOrder(week, d, ["c", "e"]).map((m) => m.externalId);
      expect(ids).not.toContain("top");
      expect(ids).not.toContain("c");
      expect(ids).not.toContain("e");
    }
  });
  it("leaves out small drops and cheap products", () => {
    expect(pickOrder([c("top", -45), c("small", -5), c("cheap", -30, 3_000)], "2026-11-10")).toEqual([]);
  });
});

describe("dayIndex", () => {
  it("steps by one per day", () => {
    expect(dayIndex("2026-11-11") - dayIndex("2026-11-10")).toBe(1);
  });
});
