import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const config: NextConfig = {
  transpilePackages: ["@baga/core", "@baga/kaspi", "@baga/db"],
  serverExternalPackages: ["postgres"],
  images: { remotePatterns: [{ protocol: "https", hostname: "resources.cdn-kaspi.kz" }] },
  poweredByHeader: false,
};

export default withNextIntl(config);
