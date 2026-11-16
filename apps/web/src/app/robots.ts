import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  // /api/digest is open: the public numbers of the home page for the owner's «Чек дня» agent, whose fetch tool obeys
  // robots.txt (13 Nov). The rest of /api/ stays closed; the longer Allow wins over Disallow: /api/.
  // SEO-tool crawlers bring no visitors and walked thousands of pages (AhrefsBot 3.6k requests a day, 16 Nov), and the
  // filtered /explore views and /p/<id>/wait are per-request renders: kept off (the owner, 16 Nov: Vercel's free CPU).
  return {
    rules: [
      { userAgent: ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "BLEXBot", "DataForSeoBot", "PetalBot", "barkrowler"], disallow: ["/"] },
      { userAgent: "*", allow: ["/", "/api/digest"], disallow: ["/api/", "/go/", "/*/explore?", "/*/p/*/wait"] },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
