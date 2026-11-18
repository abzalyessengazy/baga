import { describe, expect, it } from "vitest";
import { renderPushAlert } from "./push";

describe("browser notification", () => {
  it("says the price, the person's price and opens the product page", () => {
    const m = renderPushAlert({ type: "target_reached", locale: "ru", title: "Смартфон Apple iPhone 17 Pro 256Gb", price: 653990, target: 660000, url: "/ru/p/123", externalId: "123" });
    expect(m.title).toBe("🎯 Цена дошла до вашей!");
    expect(m.body).toContain("Смартфон Apple iPhone 17 Pro 256Gb\nСейчас на Kaspi: 653");
    expect(m.body).toContain("ваша цена 660");
    expect(m).toMatchObject({ url: "/ru/p/123", tag: "baga-123" });
  });
  it("speaks Kazakh and handles a product with no offers", () => {
    const m = renderPushAlert({ type: "first_price", locale: "kk", title: "x".repeat(120), price: null, target: null, url: "u", externalId: "9" });
    expect(m.title).toBe("🧾 Бағаны сіз үшін тексердік");
    expect(m.body.endsWith("Қазір сатылымда жоқ")).toBe(true);
    expect(m.body.split("\n")[0]!.length).toBe(90);
  });
});
