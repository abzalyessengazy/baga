"use client";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { CITY_LIST, type City } from "@baga/core";

/**
 * The visitor's city, shown only on goods whose price depends on it (pharmacy, baby care; DECISIONS.md 2026-11-10).
 * A plain link (?city=) that also remembers the choice for a year, so the next medicine opens in the same city.
 */
export function CityPicker({ city }: { city: City }) {
  const t = useTranslations("product");
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div className="city-picker" role="group" aria-label={t("cityLabel")}>
      <span className="city-picker-label">{t("cityLabel")}</span>
      {CITY_LIST.map((c) => (
        <a key={c} href={`?city=${c}`} aria-current={c === city ? "true" : undefined} className={c === city ? "is-on" : undefined}
          onClick={(e) => {
            e.preventDefault();
            document.cookie = `baga_city=${c}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
            // A ?city= in the address would win over the cookie: go to the page without it.
            if (new URL(window.location.href).searchParams.has("city")) router.replace(pathname);
            else router.refresh();
          }}>{t(`city.${c}`)}</a>
      ))}
    </div>
  );
}
