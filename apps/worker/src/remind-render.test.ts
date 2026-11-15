import { describe, expect, it } from "vitest";
import type { BfRow } from "@baga/db";
import { renderBfReminder } from "./remind-render";

const row = (id: string, kaspi: number, kind: "real" | "same" | "pricier", pct: number): BfRow => ({
  externalId: id, title: `Телевизор Samsung QE${id} <черный>`, titleKk: null, imageUrl: null, kaspiNow: kaspi, kaspiBeforeLow: kaspi,
  stores: [{ store: "technodom", name: "Technodom", url: "https://x", now: 500_000, nowOld: 700_000, checkedAt: null,
    check: { kind, pct, claimedPct: -29, before: { low: 550_000, days: 10 }, during: { low: 500_000, oldPrice: 700_000 } } }],
});

describe("Black Friday reminder", () => {
  it("counts, lists real discounts biggest first, escapes, links", () => {
    const m = renderBfReminder([row("1", 600_000, "real", -9), row("2", 400_000, "same", 0), row("3", 600_000, "real", -20)], "ru", "https://bagaapp.com");
    expect(m.html).toContain("Настоящая скидка: 2 · цена как до распродажи: 1 · дороже: 0");
    expect(m.html.indexOf("QE3")).toBeLessThan(m.html.indexOf("QE1"));
    expect(m.html).toContain("&lt;черный&gt;");
    expect(m.html).toContain("Товаров, которые на Kaspi дешевле, чем в магазине: 1.");
    expect(m.buttons[0]).toMatchObject({ url: "https://bagaapp.com/ru/black-friday?utm_source=tg_bf&utm_medium=reminder" });
  });
  it("says so plainly when nothing fell", () => {
    expect(renderBfReminder([row("2", 400_000, "same", 0)], "kk", "https://bagaapp.com").html).toContain("әзірге шынайы жеңілдік жоқ");
  });
});
