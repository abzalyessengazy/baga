import { describe, expect, it } from "vitest";
import { isCityDependent, isCity, EXTRA_CITIES, CITIES } from "./cities";

describe("prices by city", () => {
  it("only pharmacy and baby-care goods depend on the city", () => {
    expect(isCityDependent(["Аптека", "Лекарства", "Простуда, насморк, боль в горле"])).toBe(true);
    expect(isCityDependent(["Детские товары", "Для малыша и мамы", "Уход и гигиена малыша", "Подгузники"])).toBe(true);
    expect(isCityDependent(["Детские товары", "Игрушки"])).toBe(false);
    expect(isCityDependent(["Телефоны и гаджеты", "Смартфоны"])).toBe(false);
    expect(isCityDependent([])).toBe(false);
  });
  it("knows the four cities, Almaty being the reference", () => {
    expect(EXTRA_CITIES).toEqual(["astana", "shymkent", "atyrau"]);
    expect(CITIES.almaty).toBe("750000000");
    expect(isCity("atyrau")).toBe(true);
    expect(isCity("london")).toBe(false);
  });
});
