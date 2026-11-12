import { ImageResponse } from "next/og";
import { computeVerdict, formatTenge } from "@baga/core";
import { getProductView } from "@/lib/product";
import { sparkline } from "@/lib/ogSpark";
import { dayMonth, type DatesT } from "@/lib/dayMonth";
import { OG_CHART, OG_SIZE, ogFonts, ogMessages, ogT, productCard, shortTitle, homeCard } from "@/og/card";

/**
 * The product page's link preview (Telegram, WhatsApp, Instagram DMs): title, today's lowest price, the verdict's
 * label and the observed daily lows. From our database only, like the page; a product we do not have yet gets the
 * site's card. Cached for an hour: messengers keep their own copy anyway.
 */
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateImageMetadata({ params }: Props) {
  const { locale, id } = await params;
  const t = ogT(locale);
  const r = /^\d{5,12}$/.test(id) ? await getProductView(id) : null;
  return [{ id: "card", size: OG_SIZE, contentType, alt: r?.ok ? t("alt", { title: r.view.title }) : t("homeHeadline") }];
}

export default async function Image({ params }: Props) {
  const { locale, id } = await params;
  const L = locale === "kk" ? "kk" : "ru";
  const t = ogT(L), tv = ogMessages(L, "verdict"), td = ogMessages(L, "dates");
  const fonts = await ogFonts();
  const r = /^\d{5,12}$/.test(id) ? await getProductView(id) : null;
  if (!r?.ok) {
    return new ImageResponse(homeCard({ tag: t("tag"), site: t("site"), headline: t("homeHeadline"), sub: t("homeSub") }), { ...OG_SIZE, fonts });
  }
  const v = r.view;
  const f = (n: number) => formatTenge(n, L);
  const verdict = v.minPrice !== null ? computeVerdict(v.history, v.minPrice) : null;
  const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Almaty" }).format(new Date(v.checkedAt));
  const footer = [t("checked", { date: `${dayMonth(v.checkedAt, td as unknown as DatesT)}, ${time}` }),
    v.history.length > 1 ? t("observed", { days: v.history.length }) : null].filter(Boolean).join(" · ");
  const card = productCard({
    locale: L, tag: t("tag"), site: t("site"), title: shortTitle(v.title),
    label: v.minPrice !== null ? t("lowestNow") : t("notSold"),
    price: v.minPrice !== null ? f(v.minPrice) : null,
    note: v.minPrice === null && v.lastPrice ? t("lastPrice", { price: f(v.lastPrice) }) : null,
    // "Мало данных" says nothing to someone deciding whether to open the link: no stamp then.
    verdict: verdict && verdict.kind !== "insufficient" ? { text: tv(verdict.kind), high: verdict.kind === "high" } : null,
    spark: sparkline(v.history, OG_CHART.w, OG_CHART.h), chartLabel: t("chart"),
    footer,
  });
  return new ImageResponse(card, { ...OG_SIZE, fonts });
}
