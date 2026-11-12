"use client";
import { createContext, useContext, useState } from "react";
import type { City } from "@baga/core";

/**
 * The chosen city on a page of city-dependent goods (pharmacy, baby care; DECISIONS.md 2026-11-10). The server renders
 * every city's price and sellers (four small blocks) and this shows the chosen one, so a tap on another city switches
 * at once with no request (the owner, 12 Nov: a refresh of the whole page took seconds).
 */
const Ctx = createContext<{ city: City; setCity: (c: City) => void } | null>(null);

export function CityProvider({ initial, children }: { initial: City; children: React.ReactNode }) {
  const [city, setCity] = useState(initial);
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
