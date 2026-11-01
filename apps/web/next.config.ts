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
  // Inline the small stylesheet into the HTML: one less round trip before first paint on mobile.
  experimental: { inlineCss: true },
};

export default withNextIntl(config);
