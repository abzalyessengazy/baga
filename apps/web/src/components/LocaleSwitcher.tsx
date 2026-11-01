"use client";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTransition } from "react";
import type { Locale } from "@/i18n/routing";

/** Swaps only the /ru|/kk prefix. Path, query and the typed link (kept in sessionStorage) survive. */
export function LocaleSwitcher() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (next: Locale) => {
    if (next === locale) return;
    const query = Object.fromEntries(new URLSearchParams(window.location.search).entries());
    start(() => router.replace({ pathname, query }, { locale: next, scroll: false }));
  };
  return (
    <div className="lang" role="group" aria-label={t("language")} aria-busy={pending}>
      <button type="button" aria-pressed={locale === "ru"} lang="ru" onClick={() => go("ru")}>{t("ru")}</button>
      <button type="button" aria-pressed={locale === "kk"} lang="kk" onClick={() => go("kk")}>{t("kk")}</button>
    </div>
  );
}
