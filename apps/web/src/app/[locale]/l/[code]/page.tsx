import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isInVisitWindow, nextVisitWindowDay } from "@baga/core";
import { redirect } from "@/i18n/navigation";
import { shortLinkStatus, collectorRunning } from "@/lib/product";
import { QueuedWatcher } from "@/components/QueuedWatcher";
import { TrackPanel } from "@/components/TrackPanel";
import { trackInitial } from "@/lib/watcher";
import { alreadyTracked } from "@/lib/catalog";
import { Related } from "@/components/Related";
import { PrintIn, StampIn } from "@/components/PrintIn";

type Props = { params: Promise<{ locale: string; code: string }> };

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * A short link from the Kaspi app that the website could not resolve (Kaspi does not answer Vercel). The collector
 * resolves it in its next window; this page then forwards to the product. No Kaspi request is made here.
 */
export default async function ShortLinkPage({ params }: Props) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(code)) notFound();
  const row = await shortLinkStatus(code);
  if (!row) notFound();
  if (row.status === "resolved" && row.externalId) {
    redirect({ href: `/p/${row.externalId}${row.slug ? `?s=${encodeURIComponent(row.slug)}` : ""}`, locale });
  }
  const [t, te] = await Promise.all([getTranslations("product"), getTranslations("errors")]);
  if (row.status === "failed") {
    return (
      <main className="wrap error-page">
        <p className="subline" role="alert">{te("short_link")}</p>
      </main>
    );
  }
  const live = isInVisitWindow(new Date()) && (await collectorRunning());
  return (
    <main className="wrap untracked">
      <PrintIn className="receipt">
        <StampIn>{t("queuedStamp")}</StampIn>
        <p className="untracked-name">{t("shortLinkNote")}</p>
        <hr className="rule" />
        <p className="untracked-status" role="status">
          {live ? t("fetchingNow") : nextVisitWindowDay(new Date()) === "today" ? t("queuedToday") : t("queuedTomorrow")}
        </p>
        {live && <QueuedWatcher />}
        <a className="kaspi-link" href={`https://l.kaspi.kz${row.path}`} rel="noopener noreferrer">{t("openOnKaspi")}</a>
      </PrintIn>
      {/* The visitor can set a price now; it moves onto the product when the collector resolves the link. */}
      <TrackPanel productId={code} shortLink={code} current={null} initial={await trackInitial({ shortLink: code })}
        related={<Related lists={await alreadyTracked("", null)} locale={locale as "ru" | "kk"} />} />
    </main>
  );
}
