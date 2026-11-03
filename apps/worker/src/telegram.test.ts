import { describe, expect, it } from "vitest";
import { renderTelegramAlert } from "./telegram";

const base = { title: "Apple iPhone 18 Pro <256Gb>", target: 600_000, offerCount: 12, productUrl: "https://bagaapp.com/ru/p/1", kaspiUrl: "https://bagaapp.com/go/1?n=5" };

describe("renderTelegramAlert", () => {
  it("first price above the target promises a later message", () => {
    const m = renderTelegramAlert({ ...base, type: "first_price", locale: "ru", price: 650_000 });
    expect(m.html).toContain("🧾 <b>Цена получена</b>");
    expect(m.html).toMatch(/Сейчас на Kaspi: <b>650\s000\s₸<\/b> · продавцов: 12/);
    expect(m.html).toMatch(/Ваша цена: 600\s000\s₸/);
    expect(m.html).toContain("Напишем, когда цена опустится до вашей.");
  });
  it("escapes the product title for Telegram HTML", () => {
    const m = renderTelegramAlert({ ...base, type: "target_reached", locale: "ru", price: 590_000 });
    expect(m.html).toContain("<b>Apple iPhone 18 Pro &lt;256Gb&gt;</b>");
  });
  it("target reached, in Kazakh, with Kaspi first among the buttons", () => {
    const m = renderTelegramAlert({ ...base, type: "target_reached", locale: "kk", price: 590_000 });
    expect(m.html).toContain("Баға сіздің бағаңызға жетті!");
    expect(m.buttons).toEqual([
      { text: "Kaspi-де ашу", url: "https://bagaapp.com/go/1?n=5" },
      { text: "BAĞA-да ашу", url: "https://bagaapp.com/ru/p/1" },
    ]);
  });
  it("out of stock says so instead of a price", () => {
    const m = renderTelegramAlert({ ...base, type: "first_price", locale: "ru", price: null, offerCount: 0 });
    expect(m.html).toContain("сейчас нет в продаже");
  });
  it("a percentage target still waiting for a price leaves out the target line", () => {
    const m = renderTelegramAlert({ ...base, type: "first_price", locale: "ru", price: null, target: null, offerCount: 0 });
    expect(m.html).not.toContain("Ваша цена");
    expect(m.html).toContain("Напишем, когда цена опустится до вашей.");
  });
});
