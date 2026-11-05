"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { byRating, type SellerLabel } from "@baga/core";
import { Link } from "@/i18n/navigation";

export interface SellerRow {
  sellerId: string; sellerName: string; sellerRating: number | null; sellerReviews: number | null;
  price: number; priceText: string; deliveryText: string;
  label: SellerLabel;
  /** How many percent below the other sellers (cheapOutlierPct), or null. */
  cheaperPct: number | null;
}

/**
 * The sellers of a product (DECISIONS.md, 2026-11-05 "Shop evidence, not verdicts"): cheapest first by default,
 * or by Kaspi's rating (confidence-adjusted, byRating) on request; nothing is hidden either way. Each shop shows
 * Kaspi's rating, review count and the label they earn, and links to its page.
 */
export function SellerTable({ rows, shown, ratedAt }: { rows: SellerRow[]; shown: number; ratedAt: string }) {
  const t = useTranslations("product");
  const ts = useTranslations("sellers");
  const [order, setOrder] = useState<"price" | "rated">("price");
  const list = (order === "rated" ? byRating(rows) : rows).slice(0, shown);
  const cheapest = Math.min(...rows.map((r) => r.price));
  const count = (n: number) => ts("reviews", { count: n });

  return (
    <>
      <div className="seller-order" role="group" aria-label={ts("orderLabel")}>
        {(["price", "rated"] as const).map((o) => (
          <button key={o} type="button" aria-pressed={order === o} className={order === o ? "is-on" : undefined}
            onClick={() => setOrder(o)}>{ts(o === "price" ? "orderCheap" : "orderRated")}</button>
        ))}
      </div>
      <table className="offers">
        <thead><tr><th>{t("seller")}</th><th className="col-delivery">{t("delivery")}</th><th className="num">{t("price")}</th></tr></thead>
        <tbody>
          {list.map((o) => (
            <tr key={o.sellerId} className={o.price === cheapest ? "is-best" : undefined}>
              <td>
                <Link className="seller-link" href={`/s/${o.sellerId}`}>{o.sellerName}</Link>
                <span className="seller-meta">
                  {o.label !== "none" && <>★{o.sellerRating!.toFixed(1)} · {count(o.sellerReviews!)} · </>}
                  <span className={`seller-label is-${o.label}`}>{ts(`label_${o.label}`)}</span>
                </span>
                {o.cheaperPct !== null && <span className="seller-warn">{ts("cheaper", { pct: o.cheaperPct })}</span>}
              </td>
              <td className="col-delivery">{o.deliveryText}</td>
              <td className="num">{o.priceText}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">{ts("source", { date: ratedAt })}</p>
    </>
  );
}
