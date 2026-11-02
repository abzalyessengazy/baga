import { describe, expect, it } from "vitest";
import { renderTelegramAlert } from "./telegram";

const base = { title: "Apple iPhone 18 Pro 256Gb", target: 600_000, offerCount: 12, productUrl: "https://baga.kz/ru/p/1", kaspiUrl: "https://baga.kz/go/1?n=5" };

describe("renderTelegramAlert", () => {
  it("first price above the target promises a later message", () => {
    const t = renderTelegramAlert({ ...base, type: "first_price", locale: "ru", price: 650_000 });
    expect(t).toContain("BAGA: цена получена");
    expect(t).toMatch(/Сейчас на Kaspi: 650\s000\s₸ \(продавцов: 12\)/);
    expect(t).toMatch(/Ваша цена: 600\s000\s₸/);
    expect(t).toContain("Напишем, когда цена опустится до вашей.");
  });
  it("target reached, in Kazakh", () => {
    const t = renderTelegramAlert({ ...base, type: "target_reached", locale: "kk", price: 590_000 });
    expect(t).toContain("BAGA: баға сіздің бағаңызға жетті");
    expect(t).toContain("https://baga.kz/go/1?n=5");
  });
  it("out of stock says so instead of a price", () => {
    const t = renderTelegramAlert({ ...base, type: "first_price", locale: "ru", price: null, offerCount: 0 });
    expect(t).toContain("сейчас нет в продаже");
  });
});
