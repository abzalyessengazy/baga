"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { almatyDay, runningSale, upcomingSale, type SaleEvent } from "@baga/core";
import { Link } from "@/i18n/navigation";
import { saleDates } from "@/lib/sale-dates";

/**
 * On the home page while a sale runs: what BAĞA does during it, and where to see the moves; up to two weeks before
 * it starts: its dates and that we are recording the prices before it. Decided in the browser,
 * because the home page is prerendered and a sale starts and ends between deploys.
 */
export function SaleBanner() {
  const t = useTranslations("sale");
  const locale = useLocale() as "ru" | "kk";
  const [sale, setSale] = useState<{ s: SaleEvent; soon: boolean } | null>(null);
  useEffect(() => {
    const day = almatyDay();
    const now = runningSale(day);
    const next = now ? null : upcomingSale(day);
    setSale(now ? { s: now, soon: false } : next ? { s: next, soon: true } : null);
  }, []);
  if (!sale) return null;
  const vars = { sale: t(`names.${sale.s.id}` as "names.kaspiJuma202611"), dates: saleDates(sale.s, locale) };
  return (
    <div className="wrap">
      <aside className={`sale-banner${sale.soon ? " is-soon" : ""}`}>
        <p>{sale.soon ? t.rich("bannerSoon", { ...vars, b: (c) => <strong>{c}</strong> }) : t("banner", vars)}</p>
        {!sale.soon && <Link href="/drops">{t("bannerLink")} →</Link>}
      </aside>
    </div>
  );
}
