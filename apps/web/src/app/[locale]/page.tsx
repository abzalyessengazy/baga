import { getTranslations, setRequestLocale } from "next-intl/server";
import { HomeHero } from "@/components/HomeHero";
import { Highlights } from "@/components/Highlights";
import { HowItWorks } from "@/components/HowItWorks";
import { HonestReceipt } from "@/components/HonestReceipt";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  return (
    <main>
      <HomeHero />
      <Highlights />
      <HowItWorks />
      <HonestReceipt />
      <footer className="wrap site-footer">{t("footer")}</footer>
    </main>
  );
}
