import { getTranslations, setRequestLocale } from "next-intl/server";
import { HomeHero } from "@/components/HomeHero";
import { ZReport } from "@/components/ZReport";
import { HowItWorks } from "@/components/HowItWorks";
import { HonestReceipt } from "@/components/HonestReceipt";

const SUPPORT_EMAIL = "abzal.yessengazy@gmail.com";

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
