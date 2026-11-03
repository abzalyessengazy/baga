"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { almatyDay, runningSale, upcomingSale, type SaleEvent } from "@baga/core";
import { Link } from "@/i18n/navigation";
import { saleDates, type SaleT } from "@/lib/sale-dates";

/**
 * A slim strip above the header on every page: up to two weeks before a sale its dates and that we are recording
 * the prices before it; while it runs, a link to the moves. Decided in the browser, because pages are prerendered
 * and a sale starts and ends between deploys.
 */
export function SaleBanner() {
  const t = useTranslations("sale");
  const [sale, setSale] = useState<{ s: SaleEvent; soon: boolean } | null>(null);
  useEffect(() => {
    const day = almatyDay();
    const now = runningSale(day);
    const next = now ? null : upcomingSale(day);
    setSale(now ? { s: now, soon: false } : next ? { s: next, soon: true } : null);
  }, []);
  if (!sale) return null;
  const vars = { sale: t(`names.${sale.s.id}` as "names.kaspiJuma202611"), dates: saleDates(sale.s, t as unknown as SaleT) };
  return (
    <aside className="sale-strip">
      <div className="wrap sale-strip-in">
        <span className="sale-strip-dot" aria-hidden />
        <strong>{sale.soon ? t("stripSoon", vars) : t("stripNow", vars)}</strong>
        <span className="sale-strip-text">{sale.soon ? t("stripSoonText") : t("stripNowText")}</span>
        {!sale.soon && <Link href="/drops">{t("stripLink")} →</Link>}
      </div>
    </aside>
  );
}
