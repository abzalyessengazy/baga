import { describe, expect, it } from "vitest";
import { shortTitle } from "./title";

describe("shortTitle", () => {
  it("drops the category word before a Latin brand", () => {
    expect(shortTitle("Смартфон Apple iPhone 18 Pro 512Gb NanoSIM+eSIM голубой")).toBe("Apple iPhone 18 Pro 512Gb NanoSIM+eSIM голубой");
    expect(shortTitle("Планшет Huawei MatePad SE 11")).toBe("Huawei MatePad SE 11");
  });
  it("keeps names that do not start with a category and a Latin brand", () => {
    expect(shortTitle("Стиральная машина Bosch WAN24")).toBe("Стиральная машина Bosch WAN24");
    expect(shortTitle("Пылесос Тефаль 3000")).toBe("Пылесос Тефаль 3000");
    expect(shortTitle("Apple AirPods Pro 3")).toBe("Apple AirPods Pro 3");
    expect(shortTitle("Смартфон")).toBe("Смартфон");
  });
});
