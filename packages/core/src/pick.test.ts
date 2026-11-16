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
  it("puts a drop since yesterday first, every day", () => {
    for (const d of days) expect(pickOrder(week, d, [], ["g", "top"])[0]!.externalId).toBe("g");
  });
  it("puts drops of the last two days before the week's older ones, newest first", () => {
    const w = [c("top", -45), c("old1", -40), c("old2", -35), { ...c("new2", -12), since: "2026-11-15" }, { ...c("new1", -20), since: "2026-11-16" },
      { ...c("stale", -30), since: "2026-11-10" }];
    expect(pickOrder(w, "2026-11-16").slice(0, 2).map((m) => m.externalId)).toEqual(["new1", "new2"]);
    // Four days later they are old drops again: back in the rotation, no longer ahead of it by date.
    expect(pickOrder(w, "2026-11-19").slice(0, 2).map((m) => m.externalId)).not.toEqual(["new1", "new2"]);
    expect(pickOrder(w, "2026-11-16", [], ["old2"])[0]!.externalId).toBe("old2");
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
