import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSql, loadShopIndex, pickShops, SHOP_SORTS, SHOP_TABS, type ShopList, type ShopSort, type ShopTab } from "@baga/db";
import { Link } from "@/i18n/navigation";
import { ExploreFilters } from "@/components/ExploreFilters";
import { cachedDaily } from "@/lib/dailyCache";
import { SellerChip, SellerLegend, chipKind, type LegendKind } from "@/components/SellerChips";

type Search = { list?: string; q?: string; sort?: string; page?: string };
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Search> };
export const dynamic = "force-dynamic";

const one = (v: unknown) => (typeof v === "string" ? v : undefined);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shops" });
  // Not indexed for now, like the shop pages (DECISIONS.md, 2026-11-05 "Shop evidence, not verdicts").
  return { title: t("title"), description: t("metaDescription"), robots: { index: false, follow: true } };
}

/**
 * The shop catalogue: every shop with a current offer on a product we check, grouped by the chip it earns from
 * Kaspi's rating and review count (packages/core/src/sellers.ts), with search, sorting and pages. Read from our
 * own checks; never contacts Kaspi.
 */
export default async function ShopsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("shops");
  const tab: ShopTab = SHOP_TABS.includes(one(sp.list) as ShopTab) ? (one(sp.list) as ShopTab) : "all";
  const sort: ShopSort = SHOP_SORTS.includes(one(sp.sort) as ShopSort) ? (one(sp.sort) as ShopSort) : "reviews";
  const q = (one(sp.q) ?? "").slice(0, 80);
  const page = Number.parseInt(one(sp.page) ?? "1", 10) || 1;
  const sql = getSql();
  // Reading every current offer is the costly part: cached (cachedDaily), the tab, search and page are not.
  const index = sql ? await cachedDaily(["shops-index"], () => loadShopIndex(sql)).catch((e) => { console.error(`[shops] ${e}`); return null; }) : null;
  const r: ShopList | null = index ? pickShops(index, { tab, q, sort, page }) : null;
  const href = (x: Partial<Search>) => {
    const s = new URLSearchParams();
    const v = { list: tab, q, sort, ...x };
    if (v.list && v.list !== "all") s.set("list", v.list);
    if (v.q) s.set("q", v.q);
    if (v.sort && v.sort !== "reviews") s.set("sort", v.sort);
    if (v.page && v.page !== "1") s.set("page", v.page);
    const qs = s.toString();
    return qs ? `/shops?${qs}` : "/shops";
  };
  const kinds = new Set<LegendKind>();
  for (const i of r?.items ?? []) {
    kinds.add(chipKind(i.rating, i.reviews));
    if (i.checks) kinds.add("check");
    if (i.facts) kinds.add("fact");
  }

  return (
    <main className="wrap explore shops">
      <h1 className="product-title" style={{ color: "var(--ink-on-counter, var(--ink))" }}>{t("title")}</h1>
      <p className="drops-intro">{t("intro")}</p>
      <nav className="explore-tabs" aria-label={t("title")}>
        {SHOP_TABS.map((k) => (
          <Link key={k} href={href({ list: k, page: undefined })} className={`explore-tab${k === tab ? " is-on" : ""}`}
            aria-current={k === tab ? "page" : undefined}>{t(`tab_${k}`)}{r ? ` · ${r.counts[k]}` : ""}</Link>
        ))}
      </nav>
      <ExploreFilters list={tab} q={q} sort={sort}
        sorts={SHOP_SORTS.map((s) => ({ value: s, label: t(`sort_${s}`) }))}
        labels={{ search: t("search"), sort: t("sort"), apply: t("apply") }} />
      {!r ? (
        <article className="receipt"><p className="untracked-status">{t("unavailable")}</p></article>
      ) : r.items.length === 0 ? (
        <article className="receipt"><p className="untracked-status">{t("none")}</p></article>
      ) : (
        <>
          <p className="explore-count">{t("count", { count: r.total })}</p>
          <ul className="catalog-list shop-list">
            {r.items.map((s) => (
              <li key={s.externalId}>
                <Link href={`/s/${s.externalId}`} className="shop-item">
                  <span className="shop-item-name">{s.name}</span>
                  <span className="chips">
                    <SellerChip rating={s.rating} reviews={s.reviews} />
                    {s.checks > 0 && <span className="chip is-check" title={t("checksTitle", { count: s.checks })}>{t("checks", { count: s.checks })}</span>}
                    {s.facts > 0 && <span className="chip is-fact" title={t("factsTitle", { count: s.facts })}>{t("facts", { count: s.facts })}</span>}
                  </span>
                  <span className="shop-item-n">{t("products", { count: s.products })}</span>
                </Link>
              </li>
            ))}
          </ul>
          <SellerLegend kinds={kinds} />
          {r.pages > 1 && (
            <nav className="explore-pages" aria-label={t("pages")}>
              {r.page > 1 ? <Link href={href({ page: String(r.page - 1) })} rel="prev">← {t("prev")}</Link> : <span />}
              <span>{t("pageOf", { page: r.page, pages: r.pages })}</span>
              {r.page < r.pages ? <Link href={href({ page: String(r.page + 1) })} rel="next">{t("next")} →</Link> : <span />}
            </nav>
          )}
        </>
      )}
      <p className="note explore-rule">{t("rule")}</p>
    </main>
  );
}
