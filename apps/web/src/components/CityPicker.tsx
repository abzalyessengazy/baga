"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { CITY_LIST, type City } from "@baga/core";

/**
 * The visitor's city, shown only on goods whose price depends on it (pharmacy, baby care; DECISIONS.md 2026-11-10).
 * A plain link (?city=) that also remembers the choice for a year, so the next medicine opens in the same city.
 * The new city's prices come from the server (a refresh): until they arrive the tapped city is marked at once with a
 * spinner and the prices below fade (the owner, 12 Nov: a tap looked like nothing happened).
 */
export function CityPicker({ city }: { city: City }) {
  const t = useTranslations("product");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [want, setWant] = useState<City | null>(null);
  const on = pending && want ? want : city;
  return (
    <div className="city-picker" role="group" aria-label={t("cityLabel")} aria-busy={pending}>
      <span className="city-picker-label">{t("cityLabel")}</span>
      {CITY_LIST.map((c) => (
        <a key={c} href={`?city=${c}`} aria-current={c === on ? "true" : undefined}
          className={[c === on ? "is-on" : "", pending && c === want ? "is-loading" : ""].filter(Boolean).join(" ") || undefined}
          onClick={(e) => {
            e.preventDefault();
            if (c === on) return;
            document.cookie = `baga_city=${c}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
            setWant(c);
            startTransition(() => {
              // A ?city= in the address would win over the cookie: go to the page without it.
              if (new URL(window.location.href).searchParams.has("city")) router.replace(pathname);
              else router.refresh();
            });
          }}>{t(`city.${c}`)}</a>
      ))}
      <span className="sr-only" role="status">{pending && want ? t("cityLoading", { city: t(`city.${want}`) }) : ""}</span>
    </div>
  );
}
