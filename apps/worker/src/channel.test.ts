import { describe, expect, it } from "vitest";
import { renderChannelPost } from "./channel";

const mover = { externalId: "123456", title: "Телевизор Samsung <55\">", titleKk: null, imageUrl: null, now: 199_990, was: 239_990, pct: -17, offerCount: 9, checkedAt: new Date("2026-11-04T04:30:00Z"), current: 199_990 };

describe("renderChannelPost", () => {
  it("lists drops with the old price struck out and utm-tagged links", () => {
    const m = renderChannelPost({ locale: "ru", movers: [mover], site: "https://bagaapp.com", day: "2026-11-04", saleId: null });
    expect(m.html).toContain("📉 <b>Подешевели за неделю</b> · 04.11");
    expect(m.html).toContain('<a href="https://bagaapp.com/ru/p/123456?utm_source=tg_channel">');
    expect(m.html).toContain("&lt;55\"&gt;");
    expect(m.html).toMatch(/<s>239\s990\s₸<\/s> → <b>199\s990\s₸<\/b> · −17%/);
    expect(m.buttons).toEqual([{ text: "Все изменения цен", url: "https://bagaapp.com/ru/drops?utm_source=tg_channel" }]);
  });
  it("names a running sale, in Kazakh", () => {
    const m = renderChannelPost({ locale: "kk", movers: [mover], site: "https://bagaapp.com", day: "2026-11-04", saleId: "kaspiJuma202611" });
    expect(m.html).toContain("Kaspi Жұма жүріп жатыр");
    expect(m.html).toContain("/kk/p/123456");
  });
});
