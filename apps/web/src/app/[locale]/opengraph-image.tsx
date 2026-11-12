import { ImageResponse } from "next/og";
import { OG_SIZE, ogFonts, ogT, homeCard } from "@/og/card";

/** The site's link preview (home and every page without its own): the question BAĞA answers. */
export const size = OG_SIZE;
export const contentType = "image/png";

type Props = { params: Promise<{ locale: string }> };

export async function generateImageMetadata({ params }: Props) {
  const { locale } = await params;
  return [{ id: "card", size: OG_SIZE, contentType, alt: ogT(locale)("homeHeadline") }];
}

export default async function Image({ params }: Props) {
  const { locale } = await params;
  const L = locale === "kk" ? "kk" : "ru";
  const t = ogT(L);
  const fonts = await ogFonts();
  return new ImageResponse(homeCard({ tag: t("tag"), site: t("site"), headline: t("homeHeadline"), sub: t("homeSub") }), { ...OG_SIZE, fonts });
}
