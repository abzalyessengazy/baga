"use client";
import { useTranslations } from "next-intl";
import { CITY_LIST } from "@baga/core";
import { useCity } from "@/components/CityView";

/**
 * The visitor's city, shown only on goods whose price depends on it (pharmacy, baby care; DECISIONS.md 2026-11-10).
 * Every city's prices are already on the page (CityView), so a tap switches at once. The choice is remembered for a
 * year (cookie), so the next medicine opens in the same city; without JavaScript the ?city= link still works.
 */
export function CityPicker() {
  const t = useTranslations("product");
  const { city, setCity } = useCity();
  return (
    <div className="city-picker" role="group" aria-label={t("cityLabel")}>
      <span className="city-picker-label">{t("cityLabel")}</span>
      {CITY_LIST.map((c) => (
        <a key={c} href={`?city=${c}`} aria-current={c === city ? "true" : undefined} className={c === city ? "is-on" : undefined}
          onClick={(e) => {
            e.preventDefault();
            document.cookie = `baga_city=${c}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
            setCity(c);
            // A ?city= in the address would win over the cookie on the next visit: drop it.
            const url = new URL(window.location.href);
            if (url.searchParams.has("city")) {
              url.searchParams.delete("city");
              window.history.replaceState(window.history.state, "", url);
            }
          }}>{t(`city.${c}`)}</a>
      ))}
    </div>
  );
}
