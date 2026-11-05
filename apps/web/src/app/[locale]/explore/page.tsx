import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatTenge, shortTitle } from "@baga/core";
import { getSql, exploreCatalog, EXPLORE_LISTS, EXPLORE_SORTS, type ExploreList, type ExploreResult, type ExploreSort } from "@baga/db";
import { Link } from "@/i18n/navigation";
import { ExploreFilters } from "@/components/ExploreFilters";

type Search = { list?: string; q?: string; cat?: string; sort?: string; page?: string };
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Search> };

// Every search, filter and page is its own request.
export const dynamic = "force-dynamic";

const one = (v: unknown) => (typeof v === "string" ? v : undefined);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "explore" });
  return {
    title: t("title"), description: t("metaDescription"),
    alternates: { canonical: `/${locale}/explore`, languages: { "ru-KZ": "/ru/explore", "kk-KZ": "/kk/explore", "x-default": "/ru/explore" } },
  };
}

/**
 * The catalog browser: every product we watch, as drops, rises, seller spread or all, with search, a category
 * filter, sorting and pages (packages/db/src/explore.ts). Read-only, from our own checks; never contacts Kaspi.
 */
export default async function ExplorePage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("explore");
  const L = locale as "ru" | "kk";
  const f = (n: number) => formatTenge(n, L);
  const list: ExploreList = EXPLORE_LISTS.includes(one(sp.list) as ExploreList) ? (one(sp.list) as ExploreList) : "drops";
  const sortIn = EXPLORE_SORTS.includes(one(sp.sort) as ExploreSort) ? (one(sp.sort) as ExploreSort) : undefined;
  const q = (one(sp.q) ?? "").slice(0, 80);
  const cat = (one(sp.cat) ?? "").slice(0, 200) || undefined;
  const page = Number.parseInt(one(sp.page) ?? "1", 10) || 1;

  const sql = getSql();
  let r: ExploreResult | null = null;
  if (sql) r = await exploreCatalog(sql, { list, q, category: cat, sort: sortIn, page }).catch((e) => { console.error(`[explore] ${e}`); return null; });

  const href = (x: Partial<Search>) => {
    const s = new URLSearchParams();
    const v = { list, q, cat, sort: sortIn, ...x };
    if (v.list) s.set("list", v.list);
    if (v.q) s.set("q", v.q);
    if (v.cat) s.set("cat", v.cat);
    if (v.sort) s.set("sort", v.sort);
    if (v.page && v.page !== "1") s.set("page", v.page);
    return `/explore?${s.toString()}`;
  };
  // Sorts that make sense for this list.
  const sorts: ExploreSort[] = list === "drops" || list === "rises" ? ["change", "cheap", "dear", "popular", "new"]
    : list === "spread" ? ["spread", "cheap", "dear", "popular", "new"] : ["popular", "cheap", "dear", "new", "spread"];

  return (
    <main className="wrap explore">
      <h1 className="product-title" style={{ color: "var(--ink-on-counter, var(--ink))" }}>{t("title")}</h1>
      <p className="drops-intro">{t(`intro_${list}`)}</p>
      <nav className="explore-tabs" aria-label={t("title")}>
        {EXPLORE_LISTS.map((l) => (
          <Link key={l} href={href({ list: l, sort: undefined, page: undefined })} className={`explore-tab${l === list ? " is-on" : ""}`}
            aria-current={l === list ? "page" : undefined}>{t(`list_${l}`)}</Link>
        ))}
      </nav>
      <ExploreFilters list={list} q={q} cat={cat ?? ""} sort={r?.sort ?? sortIn ?? sorts[0]!}
        sorts={sorts.map((s) => ({ value: s, label: t(`sort_${s}`) }))}
        categories={(r?.categories ?? []).map((c) => ({ value: c.name, label: `${c.name} · ${c.count}` }))}
        labels={{ search: t("search"), category: t("category"), allCategories: t("allCategories"), sort: t("sort"), apply: t("apply") }} />
      {!r ? (
        <article className="receipt"><p className="untracked-status">{t("unavailable")}</p></article>
      ) : r.items.length === 0 ? (
        <article className="receipt"><p className="untracked-status">{q || cat ? t("noneFiltered") : t(`none_${list}`)}</p></article>
      ) : (
        <>
          <p className="explore-count">{t("count", { count: r.total })}</p>
          <ul className="catalog-list movers explore-list">
            {r.items.map((m) => (
              <li key={m.externalId}>
                <Link href={`/p/${m.externalId}`} className="catalog-item">
                  {m.imageUrl ? <img src={m.imageUrl} alt="" width={40} height={40} loading="lazy" /> : <span className="catalog-thumb" aria-hidden />}
                  <span className="catalog-title">
                    {shortTitle((L === "kk" && m.titleKk) || m.title)}
                    <small>
                      {m.was !== null ? <s>{t("was", { price: f(m.was) })}</s>
                        : m.lo !== null && m.hi !== null && list === "spread" ? `${f(m.lo)} – ${f(m.hi)}`
                        : !cat ? m.category : null}
                    </small>
                  </span>
                  <span className="catalog-price">
                    {f(m.price)}
                    {m.pct !== null ? <small className={m.pct < 0 ? "is-down" : "is-up"}>{m.pct > 0 ? "+" : "−"}{Math.abs(m.pct)}%</small>
                      : m.lo !== null && m.hi !== null && list === "spread" ? <small className="is-down">+{f(m.hi - m.lo)}</small>
                      : m.offerCount > 0 ? <small>{t("sellers", { count: m.offerCount })}</small> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
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
