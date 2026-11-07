import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { priceNotes, computeVerdict, formatTenge, moveDirection, nextVisitWindowDay, isValidSlug, slugName, isInVisitWindow } from "@baga/core";
import { getProductView, queuedSlug, collectorRunning } from "@/lib/product";
import { QueuedWatcher } from "@/components/QueuedWatcher";
import { alreadyTracked } from "@/lib/catalog";
import { Related } from "@/components/Related";
import { PriceChart } from "@/components/PriceChart";
import { TrackPanel } from "@/components/TrackPanel";
import { SaleCheck } from "@/components/SaleCheck";
import { ProductLookup } from "@/components/ProductLookup";
import { trackInitial } from "@/lib/watcher";
import { PrintIn, StampIn } from "@/components/PrintIn";
import { dayMonth, type DatesT } from "@/lib/dayMonth";
import { jsonLdHtml } from "@/lib/jsonLd";
import { SellerTable, type SellerRow } from "@/components/SellerTable";

type Props = { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ s?: string | string[] }> };
const fmtDate = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : "ru-KZ", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Almaty" }).format(new Date(iso));
/** "5 қар, 12:19" / "5 ноя, 12:19" (Almaty time); month names from messages, browsers lack Kazakh ones. */
const fmtTime = (iso: string, td: DatesT) =>
  `${dayMonth(iso, td)}, ${new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Almaty" }).format(new Date(iso))}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  if (!/^\d{5,12}$/.test(id)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });
  const r = await getProductView(id);
  // Lookup and error screens are not product pages: keep them out of search results.
  if (!r.ok) return { title: t("title"), robots: { index: false, follow: false } };
  const price = r.view.minPrice ? formatTenge(r.view.minPrice, locale as "ru" | "kk") : "—";
  return {
    title: t("productTitle", { title: r.view.title }),
    description: t("productDescription", { price }),
    // Canonical on bagaapp.com (metadataBase), so the vercel.app copy and ?s= variants are not indexed twice.
    alternates: { canonical: `/${locale}/p/${id}`, languages: { "ru-KZ": `/ru/p/${id}`, "kk-KZ": `/kk/p/${id}`, "x-default": `/ru/p/${id}` } },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!/^\d{5,12}$/.test(id)) notFound();
  const [t, tr, tv, tdates] = await Promise.all([getTranslations("product"), getTranslations("receipt"), getTranslations("verdict"), getTranslations("dates")]);
  const td = tdates as unknown as DatesT;
  const r = await getProductView(id);
  if (!r.ok && (r.reason === "unknown" || r.reason === "queued")) {
    // Not tracked yet. Everything here comes from our database or the visitor's own link; no Kaspi request.
    const fromQuery = (await searchParams).s;
    const s = typeof fromQuery === "string" && isValidSlug(fromQuery) ? fromQuery : await queuedSlug(id);
    const name = s ? slugName(s) : null;
    const tracked = await alreadyTracked(id, s);
    // During the visit window with the collector running, visitor requests are fetched within minutes:
    // say so and refresh until the product page exists. Otherwise "today"/"tomorrow".
    const live = r.reason === "queued" && isInVisitWindow(new Date()) && (await collectorRunning());
    return (
      <main className="wrap untracked">
        <PrintIn className="receipt">
          {r.reason === "unknown"
            ? <p className="receipt-sub" style={{ margin: 0 }}>{t("lookupNote")}</p>
            : <StampIn>{t("queuedStamp")}</StampIn>}
          {name && <p className="untracked-name">{t("fromLink", { name })}</p>}
          <hr className="rule" />
          {r.reason === "unknown"
            ? <ProductLookup id={id} slug={s} />
            : (
              // "today"/"tomorrow" follows the collector's daily run (Kaspi's robots.txt window); times are not shown.
              live ? (
                <>
                  <p className="untracked-status" role="status">{t("fetchingNow")}</p>
                  <QueuedWatcher />
                </>
              ) : (
                <p className="untracked-status" role="status">{nextVisitWindowDay(new Date()) === "today" ? t("queuedToday") : t("queuedTomorrow")}</p>
              )
            )}
          <a className="kaspi-link" href={`/go/${id}`} rel="noopener">{t("openOnKaspi")}</a>
        </PrintIn>
        {/* Queued: the visitor can set a price now; the first price goes to Telegram when the collector gets it. */}
        {r.reason === "queued" && (
          <TrackPanel productId={id} current={null} initial={await trackInitial(id)}
            related={<Related lists={tracked} locale={locale as "ru" | "kk"} />} />
        )}
      </main>
    );
  }
  if (!r.ok) {
    return (
      <main className="wrap error-page">
        <p className="subline" role="alert">{r.reason === "not_found" ? t("notFound") : t("unavailable")}</p>
      </main>
    );
  }
  const v = r.view;
  const L = locale as "ru" | "kk";
  const f = (n: number) => formatTenge(n, L);
  const verdict = v.minPrice !== null ? computeVerdict(v.history, v.minPrice) : null;
  const verdictText = !verdict ? null
    : verdict.kind === "insufficient"
      ? verdict.min !== null && verdict.observedDays > 1
        ? tv("insufficientText", { days: verdict.observedDays, min: f(verdict.min) })
        : tv("insufficientEmpty")
      : verdict.kind === "stable"
        ? tv("stableText", { days: verdict.windowDays, min: f(Math.min(verdict.min!, verdict.current)), max: f(Math.max(verdict.max!, verdict.current)) })
      : verdict.kind === "low"
        ? verdict.atLow
          ? tv("lowestText", { days: verdict.windowDays })
          : tv("lowText", { share: Math.round((verdict.cheaperThanShare ?? 0) * 100), days: verdict.windowDays })
        : verdict.kind === "typical"
          ? tv("typicalText", { low: f(verdict.typicalLow!), high: f(verdict.typicalHigh!) })
          : tv("highText", { pct: verdict.aboveMedianPct ?? 0, min: f(verdict.min!), date: fmtDate(verdict.minDay!, locale) });
  // The chart shows each day's lowest price; the total is the latest check. When a cheaper offer was seen earlier the
  // same day and is gone now, say so, so the two numbers do not look like a mistake.
  const checkedDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date(v.checkedAt));
  const lastLow = v.history[v.history.length - 1];
  // Only a real difference (MOVE_MIN_PCT, as everywhere on the site), not a few tenge.
  const earlierLow = v.minPrice !== null && lastLow && lastLow.day === checkedDay && moveDirection(lastLow.price, v.minPrice) > 0 ? lastLow.price : null;
  const shown = v.offers.slice(0, 12);
  const delivery = (d: string | null) => {
    const key = `delivery${d ?? "Unknown"}`;
    return t.has(key) ? t(key) : t("deliveryUnknown");
  };
  // Shop evidence for every offer (packages/core/src/sellers.ts): Kaspi's rating as a label, and an offer far below
  // the other sellers pointed out. Computed over all stored offers, not only the 12 shown.
  const notes = priceNotes(v.offers);
  const sellerRows: SellerRow[] = v.offers.map((o, i) => ({
    sellerId: o.sellerId, sellerName: o.sellerName, sellerRating: o.sellerRating, sellerReviews: o.sellerReviews,
    price: o.price, priceText: f(o.price), deliveryText: delivery(o.deliveryDuration), note: notes[i] ?? null,
  }));
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Product", name: v.title, image: v.imageUrl ?? undefined,
    offers: v.minPrice ? { "@type": "AggregateOffer", priceCurrency: "KZT", lowPrice: v.minPrice, offerCount: v.offerCount } : undefined,
  };

  return (
    <main className="wrap product-grid">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      <article className="receipt product-receipt">
        {/* Top row: people watching (real active trackings, from the first one) and the way to Kaspi. */}
        <div className="product-top">
        {v.watching > 0 && (
          <p className="watching" aria-label={t("watching", { count: v.watching })}>
            <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.8 10s3-5.5 8.2-5.5S18.2 10 18.2 10s-3 5.5-8.2 5.5S1.8 10 1.8 10Z" /><circle cx="10" cy="10" r="2.4" />
            </svg>
            {t("watching", { count: v.watching })}
          </p>
        )}
          <a className="btn-kaspi" href={`/go/${v.externalId}`} rel="noopener">{t("openOnKaspi")} ↗</a>
        </div>
        <div className="product-head">
          {v.imageUrl ? <img src={v.imageUrl} alt="" width={72} height={72} /> : <span />}
          <div>
            <h1 className="product-title">{v.title}</h1>
            {v.categoryPath.length > 0 && <div className="product-crumbs">{v.categoryPath.join(" / ")}</div>}
          </div>
        </div>
        <hr className="rule" />
        <div className="meta-row">
          <span>{tr("observedSince", { date: fmtDate(v.observedSince, locale) })}</span>
          <strong>{tr("checkedAt", { time: fmtTime(v.checkedAt, td) })}</strong>
        </div>
        <hr className="rule" />
        <div className="total">
          <span className="total-label">{tr("total")}</span>
          <span className="total-value">{v.delisted ? t("delisted") : v.minPrice !== null ? f(v.minPrice) : t("outOfStock")}</span>
          {v.delisted && v.lastPrice != null && (
            <span className="total-sub total-earlier">{t("delistedText", { price: f(v.lastPrice), date: fmtDate(v.checkedAt, locale) })}</span>
          )}
          {v.offerCount > 0 && <span className="total-sub">{tr("from", { count: v.offerCount })}</span>}
          {earlierLow !== null && <span className="total-sub total-earlier">{t("earlierToday", { price: f(earlierLow) })}</span>}
        </div>
        {/* Other stores at a glance, under the price (DECISIONS 2026-11-07): a plain name chip, never the store's logo;
            the exact item first, else the similar one; a click opens the store's page, the details stay in the block below. */}
        {v.minPrice !== null && v.elsewhere.length > 0 && (() => {
          const o = v.elsewhere.find((x) => x.kind === "exact") ?? v.elsewhere[0]!;
          const d = o.price - v.minPrice;
          const cls = o.kind === "similar" ? "is-similar" : d < 0 ? "is-cheaper" : "";
          return (
            <a href={o.url} target="_blank" rel="nofollow noopener noreferrer" className={`store-glance ${cls}`}>
              <span className={`store-chip is-${o.store}`}>
                <svg viewBox="0 0 20 20" width="13" height="13" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 9 10 3.5 16.5 9M5 7.8v8.7h10V7.8" />
                </svg>
                {o.name}
              </span>
              <span className="store-glance-price">{o.kind === "similar" ? t("glanceSimilar", { price: f(o.price) }) : f(o.price)}</span>
              {o.kind === "exact" && <span className="store-glance-diff">{d < 0 ? t("elsewhereCheaper", { amount: f(-d) }) : d > 0 ? t("elsewhereDearer", { amount: f(d) }) : t("elsewhereSame")}</span>}
              <span aria-hidden className="store-glance-go">↗</span>
            </a>
          );
        })()}
        {verdict && (
          <>
            <div className="verdict-line">
              <span className="receipt-sub">{tr("verdict")}</span>
              <span className={`stamp is-${verdict.kind}`}>{tv(verdict.kind)}</span>
            </div>
            <p className="verdict-text">{verdictText}</p>
          </>
        )}
        <SaleCheck history={v.history} locale={L} />
        <hr className="rule" />
        <h2 className="receipt-caption" style={{ fontSize: "inherit", fontWeight: 400, margin: "0 0 6px" }}>{t("historyTitle")}</h2>
        <PriceChart history={v.history} />
        <hr className="rule" />
        <h2 className="receipt-caption" style={{ fontSize: "inherit", fontWeight: 400, margin: "0 0 6px" }}>{t("sellersTitle")}</h2>
        {sellerRows.length > 0
          ? <SellerTable rows={sellerRows} shown={shown.length} ratedAt={dayMonth(v.checkedAt, td)} />
          : <p className="verdict-text">{v.delisted ? t("delisted") : t("outOfStock")}</p>}
        {v.offerCount > shown.length && <p className="note">{t("moreSellers", { count: v.offerCount - shown.length })}</p>}
        <p className="note">{t("nationalPrice")}</p>
        {/* Other stores, exact matches only (DECISIONS.md, 2026-11-07): the store's own price, never adjusted. */}
        {v.elsewhere.length > 0 && v.minPrice !== null && (
          <section className="elsewhere" id="elsewhere" aria-label={t("elsewhereTitle")}>
            <h2 className="elsewhere-title">{t("elsewhereTitle")}</h2>
            {v.elsewhere.filter((o) => o.kind === "exact").map((o) => {
              const d = o.price - v.minPrice!;
              return (
                <a key={o.store} className={`elsewhere-row${d < 0 ? " is-cheaper" : ""}`} href={o.url} target="_blank" rel="nofollow noopener noreferrer">
                  <span className="elsewhere-name"><span className={`store-chip is-${o.store}`}>{o.name}</span> ↗</span>
                  <span className="elsewhere-price">{f(o.price)}</span>
                  <span className="elsewhere-diff">{d < 0 ? t("elsewhereCheaper", { amount: f(-d) }) : d > 0 ? t("elsewhereDearer", { amount: f(d) }) : t("elsewhereSame")}</span>
                  <span className="elsewhere-meta">{t("elsewhereChecked", { time: fmtTime(new Date(o.observedAt).toISOString(), td) })}</span>
                </a>
              );
            })}
            {/* Same model and memory, only the colour differs or is unclear: the store's own name, no «дешевле». */}
            {v.elsewhere.some((o) => o.kind === "similar") && (
              <>
                <p className="elsewhere-similar-label">{t("elsewhereSimilar")}</p>
                {v.elsewhere.filter((o) => o.kind === "similar").map((o) => (
                  <a key={`s${o.store}`} className="elsewhere-row is-similar" href={o.url} target="_blank" rel="nofollow noopener noreferrer">
                    <span className="elsewhere-name"><span className={`store-chip is-${o.store}`}>{o.name}</span> «{o.title}» ↗</span>
                    <span className="elsewhere-price">{f(o.price)}</span>
                    <span className="elsewhere-meta">{t("elsewhereChecked", { time: fmtTime(new Date(o.observedAt).toISOString(), td) })}</span>
                  </a>
                ))}
                <p className="note">{t("elsewhereSimilarNote")}</p>
              </>
            )}
            {v.elsewhere.some((o) => o.kind === "exact") && <p className="note">{t("elsewhereNote")}</p>}
          </section>
        )}
        <div className="barcode" aria-hidden />
      </article>
      {/* Nothing to track on a delisted product: no alert can ever fire. */}
      {!v.delisted && (
        <TrackPanel productId={v.externalId} current={v.minPrice} initial={await trackInitial(v.externalId)}
          related={<Related lists={await alreadyTracked(v.externalId, null, 6, v.title)} locale={L} />} />
      )}
    </main>
  );
}
