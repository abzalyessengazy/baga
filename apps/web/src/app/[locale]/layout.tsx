import "@fontsource-variable/onest";
import "@fontsource-variable/jetbrains-mono";
import "../globals.css";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import { SiteHeader } from "@/components/SiteHeader";
import { SaleBanner } from "@/components/SaleBanner";
import { SiteFooter } from "@/components/SiteFooter";
import { Analytics } from "@/components/Analytics";
import { siteUrl } from "@/lib/site";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("title"),
    description: t("description"),
    metadataBase: new URL(siteUrl()),
    alternates: { languages: { "ru-KZ": "/ru", "kk-KZ": "/kk" } },
    openGraph: { title: t("title"), description: t("description"), locale: locale === "kk" ? "kk_KZ" : "ru_KZ" },
  };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <SaleBanner />
          <SiteHeader />
          {children}
          <SiteFooter />
          <Analytics />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
