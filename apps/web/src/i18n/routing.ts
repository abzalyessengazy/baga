import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ru", "kk"],
  defaultLocale: "ru",
  localePrefix: "always",
  // First visit: cookie, then Accept-Language (kk -> kk, anything else -> ru).
  localeDetection: true,
  localeCookie: { name: "NEXT_LOCALE", maxAge: 60 * 60 * 24 * 365 },
});
export type Locale = (typeof routing.locales)[number];
