import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const config: NextConfig = {
  transpilePackages: ["@baga/core", "@baga/kaspi", "@baga/db"],
  serverExternalPackages: ["postgres"],
  images: { remotePatterns: [{ protocol: "https", hostname: "resources.cdn-kaspi.kz" }] },
  poweredByHeader: false,
  // Local verification builds can use a separate folder so they never disturb a running `pnpm dev`.
  distDir: process.env.BAGA_DIST_DIR || ".next",
  // A cached page (product pages: an hour) is never served more than a day old while it is refreshed (DECISIONS.md,
  // 2026-11-16 "Cached product pages"); Next's default would allow a year.
  expireTime: 86_400,
  // Inline the small stylesheet into the HTML: one less round trip before first paint on mobile.
  experimental: { inlineCss: true },
  // Link previews: Next streams page metadata to the end of the body for clients it does not know as bots, where
  // Viber, Instagram, Messenger and others never look (12 Nov 2026: their previews showed nothing). These clients get
  // it in <head>; browsers keep streaming. Next's own list (Telegram, WhatsApp, Facebook, …) stays covered by "bot".
  htmlLimitedBots: /bot|crawler|spider|preview|facebookexternalhit|facebookcatalog|WhatsApp|Viber|Instagram|FBAN|FBAV|Snapchat|KAKAOTALK|Line\/|vkShare|Pinterest|Slack|Discord|LinkedIn|Skype|Yandex|Google-|bingpreview|redditbot|Applebot/i,
  // The link preview images read their fonts from disk (src/og/card.tsx); ship them with those functions.
  outputFileTracingIncludes: { "/[locale]/**": ["./src/og/fonts/*.ttf"] },
};

export default withNextIntl(config);
