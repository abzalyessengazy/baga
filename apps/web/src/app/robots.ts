import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  // /api/digest is open: the public numbers of the home page for the owner's «Чек дня» agent, whose fetch tool obeys
  // robots.txt (13 Nov). The rest of /api/ stays closed; the longer Allow wins over Disallow: /api/.
  return { rules: [{ userAgent: "*", allow: ["/", "/api/digest"], disallow: ["/api/", "/go/"] }], sitemap: `${base}/sitemap.xml` };
}
