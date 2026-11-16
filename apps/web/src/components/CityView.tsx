"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { isCity, REFERENCE_CITY, type City } from "@baga/core";

/**
 * The chosen city on a page of city-dependent goods (pharmacy, baby care; DECISIONS.md 2026-11-10). The server renders
 * every city's price and sellers (four small blocks) and this shows the chosen one, so a tap on another city switches
 * at once with no request (the owner, 12 Nov: a refresh of the whole page took seconds). The page is cached and the
 * same for everyone (DECISIONS.md, 2026-11-16 "Cached product pages"), so the city is read here: ?city=, else the
 * remembered one (cookie), else Almaty. A city other than Almaty is noted for the collector, which only asks Kaspi for
 * the cities people choose (the owner, 14 Nov).
 */
const Ctx = createContext<{ city: City; setCity: (c: City) => void } | null>(null);
const CITY_COOKIE = "baga_city";

export function CityProvider({ productId, children }: { productId: string; children: React.ReactNode }) {
  const [city, setCity] = useState<City>(REFERENCE_CITY);
  const noted = useRef<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("city");
    const c = document.cookie.split("; ").find((x) => x.startsWith(`${CITY_COOKIE}=`))?.slice(CITY_COOKIE.length + 1);
    const pick = isCity(q) ? q : isCity(c) ? c : null;
    if (pick) setCity(pick);
  }, []);
  useEffect(() => {
    if (city === REFERENCE_CITY || noted.current === city) return;
    noted.current = city;
    fetch("/api/city-view", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: productId, city }) }).catch(() => null);
  }, [city, productId]);
  return <Ctx.Provider value={{ city, setCity }}>{children}</Ctx.Provider>;
}

/** Its children only while `city` is the chosen city. */
export function CityOnly({ city, children }: { city: City; children: React.ReactNode }) {
  const c = useContext(Ctx);
  return c?.city === city ? <>{children}</> : null;
}

export function useCity() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCity outside CityProvider");
  return c;
}
