import "server-only";
import { cookies } from "next/headers";
import { isCity, REFERENCE_CITY, type City } from "@baga/core";
import { getSql, latestCityPrice, type CityPrice } from "@baga/db";

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
