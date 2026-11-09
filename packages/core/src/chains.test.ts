import { describe, expect, it } from "vitest";
import { retailChain } from "./chains";

describe("retail chains on Kaspi", () => {
  it("knows the chains' Kaspi shops by merchant id, and nothing else", () => {
    expect(retailChain("Mechta")).toBe("Mechta");
    expect(retailChain("18430177")).toBe("Technodom");
    expect(retailChain("30032741")).toBe("Evrika");
    expect(retailChain("12345")).toBeNull();
  });
});
