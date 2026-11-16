import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { nextVisitWindowDay, isValidSlug, slugName, isInVisitWindow } from "@baga/core";
import { getProductView, queuedSlug, collectorRunning } from "@/lib/product";
import { manualRunning } from "@/lib/manual";
import { QueuedWatcher } from "@/components/QueuedWatcher";
import { ProductReady } from "@/components/ProductReady";
import { alreadyTracked } from "@/lib/catalog";
import { Related } from "@/components/Related";
import { TrackPanel } from "@/components/TrackPanel";
import { ProductLookup } from "@/components/ProductLookup";
import { trackInitial } from "@/lib/watcher";
import { PrintIn, StampIn } from "@/components/PrintIn";

/**
 * A product we do not have a price for yet (DECISIONS.md, 2026-11-16 "Cached product pages"): the cached product page
 * sends the visitor here, where the lookup, the queue and the manual check are rendered per request as before. Once
 * the price is saved, ProductReady refreshes the cached page and goes back to it. Not indexed.
 */
type Props = { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ s?: string | string[] }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function WaitPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!/^\d{5,12}$/.test(id)) notFound();
  const t = await getTranslations("product");
  const r = await getProductView(id);
  if (r.ok) return <main className="wrap untracked"><ProductReady id={id} /></main>;
  if (!r.ok && (r.reason === "unknown" || r.reason === "queued")) {
    // Not tracked yet. Everything here comes from our database or the visitor's own link; no Kaspi request.
    const fromQuery = (await searchParams).s;
    const s = typeof fromQuery === "string" && isValidSlug(fromQuery) ? fromQuery : await queuedSlug(id);
    const name = s ? slugName(s) : null;
    const tracked = await alreadyTracked(id, s);
    // During the visit window with the collector running, visitor requests are fetched within minutes:
    // say so and refresh until the product page exists. Otherwise "today"/"tomorrow".
    const live = r.reason === "queued" && isInVisitWindow(new Date()) && (await collectorRunning());
    // Outside the window: a manual check the visitor asked for (DECISIONS.md 2026-11-09) runs within about a minute.
    const manual = r.reason === "queued" && !live && (await manualRunning({ externalId: id }));
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
              live || manual ? (
                <>
                  <p className="untracked-status" role="status">{live ? t("fetchingNow") : t("manualChecking")}</p>
                  <QueuedWatcher />
                </>
              ) : (
                <p className="untracked-status" role="status">{nextVisitWindowDay(new Date()) === "today" ? t("queuedToday") : t("queuedTomorrow")}</p>
              )
            )}
          <a className="kaspi-link" href={`/go/${id}`} target="_blank" rel="noopener">{t("openOnKaspi")}</a>
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
}
