import "server-only";
import { cookies } from "next/headers";
import { isCity, REFERENCE_CITY, type City } from "@baga/core";
import { getSql, latestCityPrice, cityDailyLows, noteCityView, type CityPrice } from "@baga/db";

/** The visitor's city for city-dependent goods (DECISIONS.md 2026-11-10): ?city= first, then the cookie, else Almaty. */
export const CITY_COOKIE = "baga_city";

export async function visitorCity(fromQuery?: string | string[]): Promise<City> {
  if (isCity(fromQuery)) return fromQuery;
  const c = (await cookies()).get(CITY_COOKIE)?.value;
  return isCity(c) ? c : REFERENCE_CITY;
}

/** The latest sellers seen for that city, or null (never checked, the reference city, or before migration 0023). */
export async function cityPrice(externalId: string, city: City): Promise<CityPrice | null> {
  if (city === REFERENCE_CITY) return null;
  const sql = getSql();
  if (!sql) return null;
  try {
    const [p] = await sql<{ id: number }[]>`select id from products where external_id = ${externalId}`;
    return p ? await latestCityPrice(sql, p.id, city) : null;
  } catch (e) {
    console.error(`[city] ${e}`);
    return null;
  }
}

/** One city's observed daily lows for a product: its price history there (empty for Almaty or on any error). */
export async function cityHistory(externalId: string, city: City): Promise<{ day: string; price: number }[]> {
  if (city === REFERENCE_CITY) return [];
  const sql = getSql();
  if (!sql) return [];
  try {
    const [p] = await sql<{ id: number }[]>`select id from products where external_id = ${externalId}`;
    return p ? await cityDailyLows(sql, p.id, city) : [];
  } catch (e) {
    console.error(`[city] ${e}`);
    return [];
  }
}

/** The product page was opened with another city chosen: the collector checks that city for it (migration 0028). */
export function cityViewed(externalId: string, city: City): void {
  const sql = getSql();
  if (!sql || city === REFERENCE_CITY) return;
  noteCityView(sql, externalId, city).catch((e) => console.error(`[city] view ${e}`));
}
