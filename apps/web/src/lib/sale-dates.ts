import type { SaleEvent } from "@baga/core";

/** The "sale" translator, loosely typed: the month keys are built at runtime. */
export type SaleT = (key: string, values?: Record<string, string | number>) => string;

/**
 * "5–7 ноября" / "5–7 қараша": a sale's dates in the page language. Month names come from messages (`sale.months`),
 * because browsers and Node often have no Kazakh month names. `t` is the "sale" translator.
 */
export function saleDates(sale: SaleEvent, t: SaleT): string {
  const [, m1, d1] = sale.start.split("-").map(Number) as [number, number, number];
  const month = (m: number) => t(`months.m${m}`);
  if (!sale.end || sale.end === sale.start) return t("day", { d: d1, month: month(m1) });
  const [, m2, d2] = sale.end.split("-").map(Number) as [number, number, number];
  return m1 === m2 ? t("days", { d1, d2, month: month(m1) }) : t("daysTwoMonths", { d1, month1: month(m1), d2, month2: month(m2) });
}
