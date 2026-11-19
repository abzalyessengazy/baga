import { describe, expect, it } from "vitest";
import { renderStoreTargetEmail, renderStoreTargetPush, renderStoreTargetTelegram } from "./storeTarget";

const base = {
  locale: "ru" as const, title: "Смартфон Apple iPhone 17 Pro 256Gb", storeName: "Halyk Market", storePrice: 653190,
  observedAt: new Date("2026-11-19T09:12:00Z"), target: 685000, kaspi: 686854,
  storeUrl: "https://halykmarket.kz/category/x", productUrl: "https://bagaapp.com/ru/p/1",
};

describe("store target messages", () => {
  it("say the approved text with observed prices and the check time", () => {
    const m = renderStoreTargetTelegram(base);
    const plain = m.html.replace(/<[^>]+>/g, "").replace(/ | /g, " ");
    expect(plain).toContain("Смартфон Apple iPhone 17 Pro 256Gb: ваша цена есть на Halyk Market");
    expect(plain).toContain("(проверено сегодня, 14:12)");
    expect(plain).toMatch(/Ваша цена: 685 000 ₸ · Kaspi сейчас: 686 854 ₸/);
    expect(plain).toContain("бонусы и рассрочка не учтены. На Kaspi продолжаем следить.");
    expect(m.buttons.map((b) => b.text)).toEqual(["Открыть на Halyk Market", "Открыть в BAĞA"]);
  });
  it("escape a title in HTML and speak Kazakh", () => {
    expect(renderStoreTargetTelegram({ ...base, title: "A <b>" }).html).toContain("A &lt;b&gt;");
    const kk = renderStoreTargetTelegram({ ...base, locale: "kk", storeName: "Technodom" });
    expect(kk.html).toContain("сіздің бағаңыз Technodom сайтында бар");
    expect(kk.buttons[0]!.text).toBe("Technodom сайтында ашу");
  });
  it("carry a stop link by email and a short push", () => {
    const e = renderStoreTargetEmail({ ...base, stopUrl: "https://bagaapp.com/ru/email?stop=x" });
    expect(e.subject).toBe("🎯 Смартфон Apple iPhone 17 Pro 256Gb: ваша цена есть на Halyk Market");
    expect(e.text).toContain("https://bagaapp.com/ru/email?stop=x");
    const p = renderStoreTargetPush({ ...base, externalId: "1", url: "/ru/p/1" });
    expect(p.tag).toBe("baga-store-1");
    expect(p.body.split("\n")).toHaveLength(2);
  });
});
