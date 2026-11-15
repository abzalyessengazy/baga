"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { byRating, type PriceNote } from "@baga/core";
import { Link } from "@/i18n/navigation";
import { SellerChip, PriceNoteChip, SellerLegend, chipKind, type LegendKind } from "@/components/SellerChips";

export interface SellerRow {
  sellerId: string; sellerName: string; sellerRating: number | null; sellerReviews: number | null;
  price: number; priceText: string; deliveryText: string;
  /** An offer far below the other sellers (priceNote), or null. */
  note: PriceNote;
}

/**
 * The sellers of a product (DECISIONS.md, 2026-11-05 "Shop evidence, not verdicts"): cheapest first by default,
 * or by Kaspi's rating (confidence-adjusted, byRating) on request; nothing is hidden either way. Each shop shows
 * a chip with Kaspi's rating and review count, and links to its page; the legend explains the chips in view.
 */
export function SellerTable({ rows, shown, ratedAt }: { rows: SellerRow[]; shown: number; ratedAt: string }) {
  const t = useTranslations("product");
  const ts = useTranslations("sellers");
  const [order, setOrder] = useState<"price" | "rated">("price");
  const list = (order === "rated" ? byRating(rows) : rows).slice(0, shown);
  const cheapest = Math.min(...rows.map((r) => r.price));
  const kinds = new Set<LegendKind>();
  // One chip per seller (16 Nov, design review: two or three per row were noise): «проверьте продавца» when the
  // price is far below the others from a shop that is not established, else the Kaspi rating.
  const caution = (o: SellerRow) => o.note?.kind === "check";
  for (const o of list) kinds.add(caution(o) ? "check" : chipKind(o.sellerRating, o.sellerReviews));

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
                <span className="chips">
                  {caution(o) && o.note ? <PriceNoteChip note={o.note} /> : <SellerChip rating={o.sellerRating} reviews={o.sellerReviews} />}
                </span>
              </td>
              <td className="col-delivery">{o.deliveryText}</td>
              <td className="num">{o.priceText}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* What the chips mean, on request instead of three lines under every table. */}
      <details className="chip-legend-box">
        <summary>{ts("legendToggle")}</summary>
        <SellerLegend kinds={kinds} date={ratedAt} />
      </details>
    </>
  );
}
