import { describe, expect, it } from "vitest";
import type { DigestItem, Suggestion } from "@baga/db";
import { brief, renderEmailDigest, renderTelegramDigest } from "./nudge-render";

const item = (over: Partial<DigestItem>): DigestItem => ({ externalId: "111111", title: "JBL Tune 510BT <розовый>", titleKk: null, imageUrl: "https://resources.cdn-kaspi.kz/img/m/p/a.jpg?format=gallery-large", now: 9_998, was: 11_251, move: -1, target: 9_000, ...over });
const sug: Suggestion = { externalId: "222222", title: "Philips BHD350/10 фен", titleKk: null, imageUrl: null, price: 19_990, high: 27_310, pct: 27, observedDays: 9, same: true };
const base = { locale: "ru" as const, nickname: "Охотник_77", site: "https://bagaapp.com" };

describe("brief", () => {
  it("cuts at a word and marks the cut", () => {
    expect(brief("Samsung QE75QN85FAUXCE 191 см черный", 24)).toBe("Samsung QE75QN85FAUXCE…");
    expect(brief("Short name")).toBe("Short name");
  });
});

describe("3-day note", () => {
  it("leads with the drop, escapes names, tags its links and offers to stop", () => {
    const m = renderTelegramDigest({ ...base, items: [item({ move: 0, was: 500, now: 500, externalId: "333333" }), item({})], suggestions: [sug] });
    expect(m.html).toContain("Охотник_77, ваши товары за 3 дня");
    expect(m.html).toContain("кое-что подешевело");
    expect(m.html).toContain("&lt;розовый&gt;");
    expect(m.html.indexOf("111111")).toBeLessThan(m.html.indexOf("333333"));
    expect(m.html).toContain("https://bagaapp.com/ru/p/111111?utm_source=tg_digest&utm_medium=digest");
    expect(m.html).toContain("<s>11");
    expect(m.buttons[0]).toMatchObject({ text: expect.stringContaining("−27%"), url: expect.stringContaining("/p/222222") });
    expect(m.buttons.at(-1)).toEqual({ text: "🔕 Не присылать сводку", callback_data: "d:stop" });
    expect(m.photos).toHaveLength(2);
  });
  it("says a rise is a rise and never promises a drop", () => {
    const m = renderTelegramDigest({ ...base, nickname: null, items: [item({ was: 100_000, now: 110_000, move: 1 })], suggestions: [] });
    expect(m.html).toContain("подорожала");
    expect(m.html).toMatch(/\+10\s000\s₸/);
    expect(m.html).not.toMatch(/подешевеет|обязательно|снизится/);
    expect(m.buttons).toHaveLength(2);
  });
  it("email: stable prices, a stop link, Kazakh copy", () => {
    const m = renderEmailDigest({ ...base, locale: "kk", items: [item({ move: 0, was: 500, now: 500 })], suggestions: [sug], stopUrl: "https://bagaapp.com/kk/email?digest=abc" });
    expect(m.subject).toBe("3 күндегі тауарларыңыз: баға тұрақты");
    expect(m.html).toContain("email?digest=abc");
    expect(m.text).toContain("utm_source=email_digest");
    expect(m.html).toContain('<img src="https://resources.cdn-kaspi.kz/img/m/p/a.jpg?format=gallery-large"');
  });
  it("shows five products and counts the rest", () => {
    const items = Array.from({ length: 8 }, (_, i) => item({ externalId: String(100000 + i), move: 0, was: 500, now: 500 }));
    expect(renderTelegramDigest({ ...base, items, suggestions: [] }).html).toContain("и ещё 3");
  });
  it("with a sign-in code, every BAĞA link signs the reader in and keeps its page and source", () => {
    const code = "c".repeat(24);
    const m = renderTelegramDigest({ ...base, items: [item({})], suggestions: [sug], accessCode: code });
    const links = [...m.html.matchAll(/href="([^"]+)"/g)].map((x) => x[1]!).concat(m.buttons.map((b) => ("url" in b ? b.url : "")).filter(Boolean));
    expect(links.length).toBeGreaterThan(1);
    for (const l of links) expect(l.startsWith(`https://bagaapp.com/api/my/enter?c=${code}&l=ru&to=`)).toBe(true);
    expect(links.some((l) => decodeURIComponent(l).includes("/ru/p/111111?utm_source=tg_digest"))).toBe(true);
    const e = renderEmailDigest({ ...base, items: [item({})], suggestions: [], accessCode: code, stopUrl: "https://bagaapp.com/ru/email?digest=x" });
    expect(e.html).toContain(`/api/my/enter?c=${code}`);
    expect(e.html).toContain("https://bagaapp.com/ru/email?digest=x"); // the stop link stays as it is
  });
});
