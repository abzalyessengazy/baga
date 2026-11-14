import { describe, expect, it } from "vitest";
import { deviceKey, laterVariants } from "./variants";

describe("variants", () => {
  it("one key for colours, memory sizes, SIM kinds and gifts of one device", () => {
    const k = deviceKey("Смартфон Apple iPhone 18 Pro 256Gb NanoSIM+eSIM серебристый");
    expect(deviceKey("Смартфон Apple iPhone 18 Pro 1Tb dual eSIM голубой")).toBe(k);
    expect(deviceKey("Смартфон Apple iPhone 18 Pro 512Gb NanoSIM+eSIM бордовый")).toBe(k);
    expect(deviceKey("Смартфон Samsung Galaxy A17 6 ГБ/128 ГБ черный + подарок")).toBe(deviceKey("Смартфон Samsung Galaxy A17 8 ГБ/256 ГБ голубой"));
  });
  it("keeps different devices apart", () => {
    expect(deviceKey("Смартфон Apple iPhone 18 Pro 256Gb черный")).not.toBe(deviceKey("Смартфон Apple iPhone 18 Pro Max 256Gb черный"));
    expect(deviceKey("Электробритва Philips S9974/35 роторная")).not.toBe(deviceKey("Электробритва Philips S7885/50 роторная"));
  });
  it("the most reviewed variant is the main one; the rest are later variants", () => {
    const v = laterVariants([
      { id: 1, title: "Смартфон Apple iPhone 17 256Gb черный", reviews: 40 },
      { id: 2, title: "Смартфон Apple iPhone 17 512Gb белый", reviews: 900 },
      { id: 3, title: "Смартфон Apple iPhone 17 256Gb зеленый", reviews: null },
      { id: 4, title: "Фен Dyson HD19", reviews: 5 },
    ]);
    expect([...v].sort()).toEqual([1, 3]);
  });
});
