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

/**
 * Similar tracked products by the words of the link (or of the title), then other tracked products to fill the
 * list, those that people track first. Shown once the visitor has set their own price.
 */
export async function alreadyTracked(externalId: string, slug: string | null, limit = 8, title?: string): Promise<{ similar: CatalogItem[]; popular: CatalogItem[] }> {
  const sql = getSql();
  if (!sql) return { similar: [], popular: [] };
  // An extra on the page: if the database hiccups, the page shows without it.
  try {
    const words = slug ? slugTokens(slug) : title ? searchTokens(title).slice(0, 4) : [];
    const similar = words.length ? await similarProducts(sql, words, externalId, limit) : [];
    if (similar.length >= limit) return { similar, popular: [] };
    const seen = new Set(similar.map((i) => i.externalId));
    const popular = (await popularProducts(sql, externalId, limit + similar.length)).filter((i) => !seen.has(i.externalId));
    return { similar, popular: popular.slice(0, limit - similar.length) };
  } catch {
    return { similar: [], popular: [] };
  }
}

