import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { computeVerdict, formatTenge, moveDirection, nextVisitWindowDay, isValidSlug, slugName, isInVisitWindow } from "@baga/core";
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
      : verdict.kind === "low"
        ? tv("lowText", { share: Math.round((verdict.cheaperThanShare ?? 0) * 100), days: verdict.windowDays })
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
  const jsonLd = {
    "@context": "https://schema.org", "@type": "Product", name: v.title, image: v.imageUrl ?? undefined,
    offers: v.minPrice ? { "@type": "AggregateOffer", priceCurrency: "KZT", lowPrice: v.minPrice, offerCount: v.offerCount } : undefined,
  };

  return (
    <main className="wrap product-grid">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      <article className="receipt product-receipt">
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
        {shown.length > 0 ? (
          <table className="offers">
            <thead><tr><th>{t("seller")}</th><th className="col-delivery">{t("delivery")}</th><th className="num">{t("price")}</th></tr></thead>
            <tbody>
              {shown.map((o, i) => (
                <tr key={`${o.sellerName}-${i}`} className={i === 0 ? "is-best" : undefined}>
                  <td>{o.sellerName}{o.sellerRating ? <span style={{ color: "var(--ink-faint)" }}> ★{o.sellerRating.toFixed(1)}</span> : null}</td>
                  <td className="col-delivery">{delivery(o.deliveryDuration)}</td>
                  <td className="num">{f(o.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="verdict-text">{v.delisted ? t("delisted") : t("outOfStock")}</p>}
        {v.offerCount > shown.length && <p className="note">{t("moreSellers", { count: v.offerCount - shown.length })}</p>}
        <p className="note">{t("nationalPrice")}</p>
        <a className="kaspi-link" href={`/go/${v.externalId}`} rel="noopener">{t("openOnKaspi")}</a>
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
