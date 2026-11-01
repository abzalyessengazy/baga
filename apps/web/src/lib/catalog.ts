import "server-only";
import { getSql, getProductByExternalId, searchProducts, similarProducts, popularProducts, type CatalogItem } from "@baga/db";
import { searchTokens, slugTokens } from "@baga/core";

export type { CatalogItem };

/** Search BAGA's own catalog by title words, or by Kaspi product id. Never contacts Kaspi. */
export async function searchCatalog(q: string, limit = 8): Promise<CatalogItem[]> {
  const sql = getSql();
  if (!sql) return [];
  const id = q.trim().match(/^\d{5,12}$/)?.[0];
  if (id) {
    const row = await getProductByExternalId(sql, id);
    return row ? [{ externalId: row.externalId, title: row.title, imageUrl: row.imageUrl, minPrice: row.currentMinPrice, inStock: row.inStock }] : [];
  }
  return searchProducts(sql, searchTokens(q), limit);
}

/** For a product we don't track yet: similar tracked products by the words of its link, else popular ones. */
export async function alreadyTracked(externalId: string, slug: string | null, limit = 6): Promise<{ kind: "similar" | "popular"; items: CatalogItem[] }> {
  const sql = getSql();
  if (!sql) return { kind: "popular", items: [] };
  const similar = slug ? await similarProducts(sql, slugTokens(slug), externalId, limit) : [];
  if (similar.length) return { kind: "similar", items: similar };
  return { kind: "popular", items: await popularProducts(sql, externalId, limit) };
}
