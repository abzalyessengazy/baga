import { formatTenge, shortTitle } from "@baga/core";
import type { Mover } from "@baga/db";
import { Link } from "@/i18n/navigation";

/** /drops rows: picture, title, the earlier price struck out, today's price and the change in percent. */
export function MoversList({ items, locale, was }: { items: Mover[]; locale: "ru" | "kk"; was: (price: string) => string }) {
  const f = (n: number) => formatTenge(n, locale);
  return (
    <ul className="catalog-list movers">
      {items.map((m) => (
        <li key={m.externalId}>
          <Link href={`/p/${m.externalId}`} className="catalog-item">
            {m.imageUrl ? <img src={m.imageUrl} alt="" width={40} height={40} loading="lazy" /> : <span className="catalog-thumb" aria-hidden />}
            <span className="catalog-title">
              {shortTitle((locale === "kk" && m.titleKk) || m.title)}
              <small><s>{was(f(m.was))}</s></small>
            </span>
            <span className="catalog-price">
              {f(m.now)}
              <small className={m.pct < 0 ? "is-down" : "is-up"}>{m.pct > 0 ? "+" : "−"}{Math.abs(m.pct)}%</small>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
