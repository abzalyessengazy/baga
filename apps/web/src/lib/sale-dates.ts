import type { SaleEvent } from "@baga/core";

/** "5–7 ноября" / "5–7 қараша": a sale's Almaty dates in the page language. */
export function saleDates(sale: SaleEvent, locale: "ru" | "kk"): string {
  const f = new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : "ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
  const start = new Date(`${sale.start}T00:00:00Z`);
  return sale.end && sale.end !== sale.start ? f.formatRange(start, new Date(`${sale.end}T00:00:00Z`)) : f.format(start);
}
