import type { MetadataRoute } from "next";
import { getSql } from "@baga/db";
import { siteUrl } from "@/lib/site";

// Rendered per request: the product list grows between deploys, and builds must not depend on the database.
// Only products people opened in the last 60 days or track (the owner, 16 Nov: crawlers walking all ~3 000 products
// used most of Vercel's free CPU); the others are still reachable from the site.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const pages: MetadataRoute.Sitemap = ["ru", "kk"].flatMap((l) => [
    { url: `${base}/${l}`, changeFrequency: "weekly" as const },
    { url: `${base}/${l}/drops`, changeFrequency: "daily" as const },
    { url: `${base}/${l}/black-friday`, changeFrequency: "daily" as const },
    { url: `${base}/${l}/explore`, changeFrequency: "daily" as const },
    ...["privacy", "terms"].map((doc) => ({ url: `${base}/${l}/${doc}`, changeFrequency: "yearly" as const })),
  ]);
  const sql = getSql();
  if (sql) {
    const rows = await sql<{ external_id: string }[]>`select p.external_id from products p where p.status = 'active'
      and (p.last_viewed_at > now() - interval '60 days' or exists (select 1 from trackings t where t.product_id = p.id and t.status = 'active'))
      order by p.last_viewed_at desc nulls last limit 2000`;
    for (const r of rows) for (const l of ["ru", "kk"]) pages.push({ url: `${base}/${l}/p/${r.external_id}`, changeFrequency: "daily" });
  }
  return pages;
}
