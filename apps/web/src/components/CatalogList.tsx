import { formatTenge } from "@baga/core";
import { Link } from "@/i18n/navigation";

export type CatalogListItem = { externalId: string; title: string; imageUrl: string | null; minPrice: number | null; inStock: boolean };

/** Tracked products as receipt lines: picture, title, last observed lowest price. Works in server and client components. */
export function CatalogList({ items, locale, outOfStock, onPick }: {
  items: CatalogListItem[];
  locale: "ru" | "kk";
  outOfStock: string;
  onPick?: () => void;
}) {
  return (
    <ul className="catalog-list">
      {items.map((it) => (
        <li key={it.externalId}>
          <Link href={`/p/${it.externalId}`} className="catalog-item" onClick={onPick}>
            {it.imageUrl ? <img src={it.imageUrl} alt="" width={40} height={40} loading="lazy" /> : <span className="catalog-thumb" aria-hidden />}
            <span className="catalog-title">{it.title}</span>
            <span className="catalog-price">{it.inStock && it.minPrice !== null ? formatTenge(it.minPrice, locale) : outOfStock}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
