"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { almatyDay, runningSale, type SaleEvent } from "@baga/core";
import { Link } from "@/i18n/navigation";

/**
 * On the home page while a sale runs: what BAĞA does during it, and where to see the moves. Decided in the browser,
 * because the home page is prerendered and a sale starts and ends between deploys.
 */
export function SaleBanner() {
  const t = useTranslations("sale");
  const [sale, setSale] = useState<SaleEvent | null>(null);
  useEffect(() => { setSale(runningSale(almatyDay())); }, []);
  if (!sale) return null;
  return (
    <div className="wrap">
      <aside className="sale-banner">
        <p>{t("banner", { sale: t(`names.${sale.id}` as "names.kaspiJuma202611") })}</p>
        <Link href="/drops">{t("bannerLink")} →</Link>
      </aside>
    </div>
  );
}
