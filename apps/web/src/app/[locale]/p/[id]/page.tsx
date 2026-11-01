import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { computeVerdict, formatTenge } from "@baga/core";
import { getProductView } from "@/lib/product";
import { PriceChart } from "@/components/PriceChart";
import { TrackPanel } from "@/components/TrackPanel";

type Props = { params: Promise<{ locale: string; id: string }> };
const fmtDate = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : "ru-KZ", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Almaty" }).format(new Date(iso));
const fmtTime = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : "ru-KZ", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" }).format(new Date(iso));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  if (!/^\d{5,12}$/.test(id)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });
  const r = await getProductView(id);
  if (!r.ok) return { title: t("title") };
  const price = r.view.minPrice ? formatTenge(r.view.minPrice, locale as "ru" | "kk") : "—";
  return {
    title: t("productTitle", { title: r.view.title }),
    description: t("productDescription", { price }),
    alternates: { languages: { "ru-KZ": `/ru/p/${id}`, "kk-KZ": `/kk/p/${id}` } },
  };
}

export default async function ProductPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!/^\d{5,12}$/.test(id)) notFound();
  const [t, tr, tv] = await Promise.all([getTranslations("product"), getTranslations("receipt"), getTranslations("verdict")]);
  const r = await getProductView(id);
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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
          <strong>{tr("checkedAt", { time: fmtTime(v.checkedAt, locale) })}</strong>
        </div>
        <hr className="rule" />
        <div className="total">
          <span className="total-label">{tr("total")}</span>
          <span className="total-value">{v.minPrice !== null ? f(v.minPrice) : t("outOfStock")}</span>
          {v.offerCount > 0 && <span className="total-sub">{tr("from", { count: v.offerCount })}</span>}
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
        ) : <p className="verdict-text">{t("outOfStock")}</p>}
        {v.offerCount > shown.length && <p className="note">{t("moreSellers", { count: v.offerCount - shown.length })}</p>}
        <p className="note">{t("nationalPrice")}</p>
        <a className="kaspi-link" href={`/go/${v.externalId}`} rel="noopener">{t("openOnKaspi")}</a>
        <div className="barcode" aria-hidden />
      </article>
      <TrackPanel productId={v.externalId} current={v.minPrice} />
    </main>
  );
}
