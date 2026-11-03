import { describe, expect, it } from "vitest";
import { renderAlertEmail, renderBoughtEmail } from "./email";

const base = {
  title: "Apple iPhone 18 Pro <256Gb>", target: 600_000, seller: "Технодом", offerCount: 12,
  productUrl: "https://bagaapp.com/ru/p/1", kaspiUrl: "https://bagaapp.com/go/1?n=5", stopUrl: "https://bagaapp.com/ru/email?stop=abc",
};

describe("renderAlertEmail", () => {
  it("target reached names the cheapest seller and links to unsubscribe", () => {
    const m = renderAlertEmail({ ...base, type: "target_reached", locale: "ru", price: 590_000 });
    expect(m.subject).toBe("Цена дошла до вашей: Apple iPhone 18 Pro <256Gb>");
    expect(m.html).toContain("Технодом");
    expect(m.html).toContain("https://bagaapp.com/ru/email?stop=abc");
    expect(m.text).toMatch(/Сейчас на Kaspi: 590\s000\s₸/);
  });
  it("escapes the product title in HTML", () => {
    const m = renderAlertEmail({ ...base, type: "target_reached", locale: "ru", price: 590_000 });
    expect(m.html).toContain("Apple iPhone 18 Pro &lt;256Gb&gt;");
    expect(m.html).not.toContain("<256Gb>");
  });
  it("first price above the target promises a later email, in Kazakh", () => {
    const m = renderAlertEmail({ ...base, type: "first_price", locale: "kk", price: 650_000 });
    expect(m.subject).toContain("Баға алынды");
    expect(m.text).toContain("Баға сіздің бағаңызға дейін түскенде жазамыз.");
    expect(m.text).toContain("Сатушылар: 12");
  });
  it("out of stock says so instead of a price", () => {
    const m = renderAlertEmail({ ...base, type: "first_price", locale: "ru", price: null, offerCount: 0 });
    expect(m.text).toContain("сейчас нет в продаже");
  });
});

describe("renderBoughtEmail", () => {
  it("links each answer to the answer page and keeps the unsubscribe link", () => {
    const m = renderBoughtEmail({
      locale: "ru", title: "Apple iPhone 18 Pro <256Gb>", stopUrl: base.stopUrl,
      answerUrl: (a) => `https://bagaapp.com/ru/bought/abcdefabcdefabcdef?a=${a}`,
    });
    expect(m.subject).toBe("Вы купили? Apple iPhone 18 Pro <256Gb>");
    expect(m.html).toContain("Apple iPhone 18 Pro &lt;256Gb&gt;");
    for (const a of ["yes", "later", "no"]) expect(m.html).toContain(`/ru/bought/abcdefabcdefabcdef?a=${a}`);
    expect(m.text).toContain("Пока нет: https://bagaapp.com/ru/bought/abcdefabcdefabcdef?a=later");
    expect(m.html).toContain(base.stopUrl);
  });
});
