import "@fontsource-variable/onest";
import "@fontsource-variable/jetbrains-mono";
import "../globals.css";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { routing } from "@/i18n/routing";
import { SiteHeader } from "@/components/SiteHeader";
import { SaleBanner } from "@/components/SaleBanner";
import { SiteFooter } from "@/components/SiteFooter";
import { Analytics } from "@/components/Analytics";
import { ProfileQuiz } from "@/components/ProfileQuiz";
import { siteUrl } from "@/lib/site";

/** The browser bar takes the counter's colour in each scheme (globals.css --counter), so the page runs edge to edge. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#dde0e4" },
    { media: "(prefers-color-scheme: dark)", color: "#1f2227" },
  ],
};

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
    openGraph: { title: t("title"), description: t("description"), type: "website", siteName: "BAĞA", locale: locale === "kk" ? "kk_KZ" : "ru_KZ" },
    twitter: { card: "summary_large_image" },
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
          <ProfileQuiz />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
