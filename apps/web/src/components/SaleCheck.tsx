import { getTranslations } from "next-intl/server";
import { almatyDay, formatTenge, latestSaleCheck, upcomingSale, type DailyLow } from "@baga/core";
import { saleDates, type SaleT } from "@/lib/sale-dates";

/**
 * "Kaspi Жұма: проверка" on the product page: the sale price against what we saw before it and after it
 * (core/sales.ts). Observed prices only; says so when there is nothing to compare with.
 */
export async function SaleCheck({ history, locale }: { history: DailyLow[]; locale: "ru" | "kk" }) {
  const today = almatyDay();
  const c = latestSaleCheck(history, today);
  const t = await getTranslations("sale");
  const f = (n: number) => formatTenge(n, locale);
  if (!c) {
    // Before a sale: its dates, and the prices we are recording for the comparison.
    const next = upcomingSale(today);
    const seen = next ? history.filter((d) => d.day < next.start) : [];
    if (!next || !seen.length) return null;
    return (
      <div className="sale-check is-soon">
        <p className="sale-title">{t("soonTitle", { sale: t(`names.${next.id}` as "names.kaspiJuma202611"), dates: saleDates(next, t as unknown as SaleT) })}</p>
        <p>{t("soonText", { days: seen.length, price: f(Math.min(...seen.slice(-14).map((d) => d.price))) })}</p>
      </div>
    );
  }
  const lines = [
    t("during", { price: f(c.duringLow) }),
    ...(c.before ? [t("before", { price: f(c.before.low), days: c.before.days })] : []),
    c.kind === "noBaseline" ? t("noBaseline") : t(c.kind, { pct: Math.abs(c.beforePct ?? 0) }),
    c.ongoing ? t("ongoing")
      : !c.after ? t("waitingAfter")
      : c.after.pct >= 3 ? t("afterUp", { price: f(c.after.price), pct: c.after.pct })
      : c.after.pct <= -3 ? t("afterDown", { price: f(c.after.price), pct: -c.after.pct })
      : t("afterSame", { price: f(c.after.price) }),
  ];
  return (
    <div className={`sale-check is-${c.kind}`}>
      <p className="sale-title">{t("title", { sale: t(`names.${c.saleId}` as "names.kaspiJuma202611") })}</p>
      {lines.map((l) => <p key={l}>{l}</p>)}
    </div>
  );
}
