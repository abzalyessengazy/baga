import type { Market } from "@baga/db";
import { remembered } from "./remembered";

/** One /api/market request, shared by the hero receipt and the Z-report slips and kept across page changes. */
const market = remembered<Market>("/api/market");
export const loadMarket = market.load;
export const cachedMarket = market.peek;
