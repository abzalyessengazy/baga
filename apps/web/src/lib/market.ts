import type { Market } from "@baga/db";

let pending: Promise<Market | null> | null = null;

/** One /api/market request per page, shared by the hero receipt and the Z-report slips. */
export function loadMarket(): Promise<Market | null> {
  pending ??= fetch("/api/market").then((r) => (r.ok ? (r.json() as Promise<Market | null>) : null)).catch(() => null);
  return pending;
}
