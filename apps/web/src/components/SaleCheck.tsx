import { getTranslations } from "next-intl/server";
import { almatyDay, formatTenge, latestSaleCheck, type DailyLow } from "@baga/core";

/**
 * "Kaspi Жұма: проверка" on the product page: the sale price against what we saw before it and after it
 * (core/sales.ts). Observed prices only; says so when there is nothing to compare with.
 */
export async function SaleCheck({ history, locale }: { history: DailyLow[]; locale: "ru" | "kk" }) {
  const c = latestSaleCheck(history, almatyDay());
  if (!c) return null;
  const t = await getTranslations("sale");
  const f = (n: number) => formatTenge(n, locale);
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
