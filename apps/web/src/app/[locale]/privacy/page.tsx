import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalDoc } from "@/components/LegalDoc";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return {
    title: t("privacy.title"),
    alternates: { canonical: `/${locale}/privacy`, languages: { "ru-KZ": "/ru/privacy", "kk-KZ": "/kk/privacy", "x-default": "/ru/privacy" } },
  };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalDoc doc="privacy" />;
}
