/**
 * Prices by city (DECISIONS.md 2026-11-10 "Pharmacy prices by city"; CLAUDE.md rule 7). Kaspi's price for most goods
 * is national, so the history, verdict and alerts use one reference city, Almaty. The 10 Nov probe showed that
 * pharmacy and baby-care goods are sold by local shops: Виусид was not sold in Almaty but was in Atyrau, Астана and
 * Шымкент; Виферон cost 2 898 ₸ in Astana and 3 499 ₸ in Atyrau. For those goods only, the collector also asks the
 * three other cities for their sellers once a day, and the product page shows the visitor's city.
 */
export const CITIES = {
  almaty: "750000000",
  astana: "710000000",
  shymkent: "511010000",
  atyrau: "231010000",
} as const;

export type City = keyof typeof CITIES;
export const REFERENCE_CITY: City = "almaty";
export const CITY_LIST = Object.keys(CITIES) as City[];
/** The cities collected besides the reference city. */
export const EXTRA_CITIES = CITY_LIST.filter((c) => c !== REFERENCE_CITY);

export const isCity = (v: unknown): v is City => typeof v === "string" && (CITY_LIST as string[]).includes(v);

/**
 * Kaspi category paths whose prices depend on the city: the start of the path must match. Only categories the probe
 * showed to be local; electronics, beauty and home goods were the same in all four cities.
 */
export const CITY_DEPENDENT_CATEGORIES: readonly string[][] = [
  ["Аптека"],
  ["Детские товары", "Для малыша и мамы"],
];

export function isCityDependent(categoryPath: readonly string[]): boolean {
  return CITY_DEPENDENT_CATEGORIES.some((prefix) => prefix.every((p, i) => categoryPath[i] === p));
}

export const CITY_CHECKS = {
  /** Each extra city's sellers are asked again after this long (one request per city). */
  recheckHours: 20,
  /** At most this many city requests in one collector run, so they never crowd out the daily checks. */
  maxPerRun: 150,
  /** Sellers kept per city check, cheapest first. */
  sellersKept: 10,
} as const;
