import type { MetadataRoute } from "next";
import { getSql } from "@baga/db";
import { siteUrl } from "@/lib/site";

// Rendered per request: the product list grows between deploys, and builds must not depend on the database.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const pages: MetadataRoute.Sitemap = ["ru", "kk"].map((l) => ({ url: `${base}/${l}`, changeFrequency: "weekly" }));
  const sql = getSql();
  if (sql) {
    const rows = await sql<{ external_id: string }[]>`select external_id from products where status = 'active' order by last_viewed_at desc nulls last limit 5000`;
    for (const r of rows) for (const l of ["ru", "kk"]) pages.push({ url: `${base}/${l}/p/${r.external_id}`, changeFrequency: "daily" });
  }
  return pages;
}
