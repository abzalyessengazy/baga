import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { priceNote, formatTenge, reviewGrowth, shortTitle, SHOP_FEEDBACK } from "@baga/core";
import { getSql, getShop, type ShopView } from "@baga/db";
import { Link } from "@/i18n/navigation";
import { dayMonth } from "@/lib/dayMonth";
import { LabelChip, PriceNoteChip, SellerLegend, chipKind, type LegendKind } from "@/components/SellerChips";

type Props = { params: Promise<{ locale: string; id: string }> };
// Read from our own checks on every request; never contacts Kaspi.
export const dynamic = "force-dynamic";

const validId = (id: string) => /^[A-Za-z0-9_-]{1,40}$/.test(id);

async function load(id: string): Promise<ShopView | null> {
  const sql = getSql();
  if (!sql || !validId(id)) return null;
  return getShop(sql, id).catch((e) => { console.error(`[shop] ${id}: ${e}`); return null; });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "shop" });
  const s = await load(id);
  // Not indexed for now: a page about a named shop should first prove itself (DECISIONS.md, 2026-11-05).
  return { title: s ? t("metaTitle", { name: s.name }) : t("notFound"), description: t("metaDescription"), robots: { index: false, follow: true } };
}

/**
 * A shop's page (DECISIONS.md, 2026-11-05 "Shop evidence, not verdicts"): Kaspi's rating and review count with
 * their label, review growth from BAGA's daily records, the shop's offers on products we check (offers far below
 * the other sellers pointed out), and what BAGA users said after buying, once there are enough answers.
 */
export default async function ShopPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const s = await load(id);
  if (!s) notFound();
  const t = await getTranslations("shop");
  const td = await getTranslations("dates");
  const L = locale as "ru" | "kk";
  const f = (n: number) => formatTenge(n, L);
  const num = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
  const kind = chipKind(s.rating, s.reviews);
  const notes = s.products.map((p) => priceNote(p.price, p.others, s.rating, s.reviews));
  const noteKinds = new Set<LegendKind>(notes.flatMap((n) => (n ? [n.kind] : [])));
  const growth = reviewGrowth(s.daily);
  const fb = s.feedback;

  return (
    <main className="wrap explore shop">
      <p className="receipt-sub shop-kicker">{t("kicker")}</p>
      <h1 className="product-title" style={{ color: "var(--ink-on-counter, var(--ink))" }}>{s.name}</h1>

      <article className="receipt">
        <dl className="shop-facts">
          <div><dt>{t("rating")}</dt><dd>{kind === "none" ? "—" : `★${s.rating!.toFixed(1)}`}</dd></div>
          <div><dt>{t("reviewsCount")}</dt><dd>{s.reviews ? num(s.reviews) : "—"}</dd></div>
          <div><dt>{t("label")}</dt><dd><LabelChip kind={kind} /></dd></div>
        </dl>
        <p className="note">
          {s.seenAt && t("asOf", { date: dayMonth(s.seenAt.toISOString(), td) })}
          {s.firstSeenAt && <> · {t("seenSince", { date: dayMonth(s.firstSeenAt.toISOString(), td) })}</>}
        </p>
        <hr className="rule" />
        <h2 className="receipt-caption shop-h2">{t("growthTitle")}</h2>
        <p className="verdict-text">
          {growth
            ? t("growth", { added: `${growth.added >= 0 ? "+" : "−"}${num(Math.abs(growth.added))}`, days: growth.days, date: dayMonth(growth.since, td) })
            : s.daily.length ? t("growthPending", { date: dayMonth(s.daily[0]!.day, td) }) : t("growthNone")}
        </p>
        <p className="note">{t("growthNote")}</p>
        <hr className="rule" />
        <h2 className="receipt-caption shop-h2">{t("feedbackTitle")}</h2>
        <p className="verdict-text">
          {fb.n >= SHOP_FEEDBACK.minToShow
            ? t("feedbackSummary", { n: fb.n, ok: fb.ok, late: fb.late, notAsDescribed: fb.not_as_described, notDelivered: fb.not_delivered })
            : fb.n > 0 ? t("feedbackFew", { n: fb.n, min: SHOP_FEEDBACK.minToShow }) : t("feedbackNone")}
        </p>
        <p className="note">{t("disclaimer")}</p>
      </article>

      <h2 className="shop-products-title">{t("productsTitle")} · {t("productsCount", { count: s.productCount })}</h2>
      <ul className="catalog-list movers explore-list">
        {s.products.map((p, i) => {
          const note = notes[i];
          const isMin = p.minPrice !== null && p.price <= p.minPrice;
          return (
            <li key={p.externalId}>
              <Link href={`/p/${p.externalId}`} className="catalog-item">
                {p.imageUrl ? <img src={p.imageUrl} alt="" width={40} height={40} loading="lazy" /> : <span className="catalog-thumb" aria-hidden />}
                <span className="catalog-title">
                  {shortTitle((L === "kk" && p.titleKk) || p.title)}
                  <small>{p.others.length > 0 ? t("otherSellers", { count: p.others.length }) : null}</small>
                </span>
                <span className="catalog-price">
                  {f(p.price)}
                  {note ? <small><PriceNoteChip note={note} /></small>
                    : isMin && p.others.length > 0 ? <small className="is-down">{t("cheapest")}</small> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {notes.some(Boolean) && <SellerLegend kinds={noteKinds} />}
      {s.productCount > s.products.length && <p className="note">{t("productsMore", { shown: s.products.length })}</p>}
    </main>
  );
}
