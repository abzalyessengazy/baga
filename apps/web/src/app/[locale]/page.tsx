import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HomeHero } from "@/components/HomeHero";
import { ZReport } from "@/components/ZReport";
import { HowItWorks } from "@/components/HowItWorks";
import { HonestReceipt } from "@/components/HonestReceipt";

const SUPPORT_EMAIL = "abzal.yessengazy@gmail.com";

// Canonical on bagaapp.com (metadataBase), so the vercel.app copy is not indexed twice.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: { canonical: `/${locale}`, languages: { "ru-KZ": "/ru", "kk-KZ": "/kk", "x-default": "/ru" } } };
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  return (
    <main>
      <HomeHero />
      <HowItWorks />
      <ZReport />
      <HonestReceipt />
      <footer className="wrap site-footer">
        <p>{t("footer")}</p>
        <p>{t("footerContact")} <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> · {t("footerSince")}</p>
      </footer>
    </main>
  );
}
