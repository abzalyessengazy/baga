import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  // /api/digest is open: the public numbers of the home page for the owner's «Чек дня» agent, whose fetch tool obeys
  // robots.txt (13 Nov). The rest of /api/ stays closed; the longer Allow wins over Disallow: /api/.
  // SEO-tool crawlers bring no visitors and walked thousands of pages (AhrefsBot 3.6k requests a day, 16 Nov), and the
  // filtered /explore views and /p/<id>/wait are per-request renders: kept off (the owner, 16 Nov: Vercel's free CPU).
  // AI-training and backlink crawlers too (17 Nov, Vercel Observability: GPTBot 7 300 product pages in 36 h, Amazonbot
  // 3 400 link-preview images, SE Ranking 900). OAI-SearchBot and ChatGPT-User stay: they answer people's questions.
  return {
    rules: [
      { userAgent: ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "BLEXBot", "DataForSeoBot", "PetalBot", "barkrowler",
          "GPTBot", "Amazonbot", "SERankingBacklinksBot", "SERankingBot", "CCBot", "Bytespider", "ClaudeBot", "meta-externalagent",
          // 18 Nov: Meta's index crawler, ~5 500 product and share pages in 6 h. facebookexternalhit (link previews in
          // WhatsApp, Instagram, Facebook) is another bot and stays allowed.
          "meta-webindexer"], disallow: ["/"] },
      { userAgent: "*", allow: ["/", "/api/digest"], disallow: ["/api/", "/go/", "/*/explore?", "/*/p/*/wait"] },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
