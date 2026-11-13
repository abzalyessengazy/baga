import { describe, expect, it } from "vitest";
import { cleanNickname, digestMood, levelFor, nicknameError, potentialSaving } from "./profile";

describe("nickname", () => {
  it("accepts ordinary nicknames in any alphabet", () => {
    for (const s of ["Айгерим", "Batyr_07", "Қайрат", "mr. Saver", "Аня-2"]) expect(nicknameError(s)).toBeNull();
  });
  it("rejects length, odd characters, contact details and reserved words", () => {
    expect(nicknameError("a")).toBe("length");
    expect(nicknameError("x".repeat(21))).toBe("length");
    expect(nicknameError("<b>hi</b>")).toBe("chars");
    expect(nicknameError("_start")).toBe("chars");
    expect(nicknameError("me@mail")).toBe("personal");
    expect(nicknameError("87011234567")).toBe("personal");
    expect(nicknameError("BAGA admin")).toBe("reserved");
    expect(nicknameError("k a s p i")).toBe("reserved");
  });
  it("cleans spaces", () => expect(cleanNickname("  Ali   Baba ")).toBe("Ali Baba"));
});

describe("levels", () => {
  it("moves up with tracked products", () => {
    expect(levelFor(0).id).toBe("newcomer");
    expect(levelFor(1).id).toBe("scout");
    expect(levelFor(4)).toMatchObject({ id: "hunter", next: { id: "sniper", need: 1 }, progress: 0.5 });
    expect(levelFor(25)).toMatchObject({ id: "master", next: null, progress: 1 });
  });
});

describe("savings and mood", () => {
  it("counts only a price above the target", () => {
    expect(potentialSaving(100, 80)).toBe(20);
    expect(potentialSaving(80, 100)).toBe(0);
    expect(potentialSaving(null, 100)).toBe(0);
  });
  it("a drop is the news, then a rise, else stable", () => {
    expect(digestMood([0, 1, -1])).toBe("down");
    expect(digestMood([0, 1])).toBe("up");
    expect(digestMood([0, 0])).toBe("stable");
    expect(digestMood([])).toBe("stable");
  });
});
