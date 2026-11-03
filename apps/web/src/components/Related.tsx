import { getTranslations } from "next-intl/server";
import type { CatalogItem } from "@/lib/catalog";
import { CatalogList } from "./CatalogList";

/** Similar products, then others people track: revealed under the coupon once the visitor has set a price. */
export async function Related({ lists, locale }: { lists: { similar: CatalogItem[]; popular: CatalogItem[] }; locale: "ru" | "kk" }) {
  const t = await getTranslations("product");
  const { similar, popular } = lists;
  if (!similar.length && !popular.length) return null;
  return (
    <>
      {similar.length > 0 && (
        <>
          <h2>{t("similarTracked")}</h2>
          <CatalogList items={similar} locale={locale} outOfStock={t("outOfStock")} />
        </>
      )}
      {popular.length > 0 && (
        <>
          <h2>{similar.length ? t("moreTracked") : t("popularTracked")}</h2>
          <CatalogList items={popular} locale={locale} outOfStock={t("outOfStock")} />
        </>
      )}
    </>
  );
}
