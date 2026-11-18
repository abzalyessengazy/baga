import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { siteUrl } from "@/lib/site";
import { HomeHero } from "@/components/HomeHero";
import { ZReport } from "@/components/ZReport";
import { HowItWorks } from "@/components/HowItWorks";
import { HonestReceipt } from "@/components/HonestReceipt";
import { Ticker } from "@/components/Ticker";
import { Leaderboard } from "@/components/Leaderboard";
import { BlackFridayBanner } from "@/components/BlackFridayBanner";

// Canonical on bagaapp.com (metadataBase), so the vercel.app copy is not indexed twice.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: { canonical: `/${locale}`, languages: { "ru-KZ": "/ru", "kk-KZ": "/kk", "x-default": "/ru" } } };
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("meta");
  // What BAĞA is, for search engines and AI assistants (18 Nov, DECISIONS "Guides for search and AI answers"): the same
  // name and description as the page's own meta tags, nothing added.
  const ld = {
    "@context": "https://schema.org", "@type": "WebApplication", name: "BAĞA", url: `${siteUrl()}/${locale}`,
    description: t("description"), inLanguage: locale === "kk" ? "kk-KZ" : "ru-KZ", applicationCategory: "ShoppingApplication",
    operatingSystem: "Web", areaServed: "KZ", offers: { "@type": "Offer", price: 0, priceCurrency: "KZT" },
  };
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <Ticker />
      <HomeHero />
      <BlackFridayBanner />
      <HowItWorks />
      <ZReport />
      <Leaderboard />
      <HonestReceipt />
    </main>
  );
}
