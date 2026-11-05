import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getBoughtByCode, getSql, productSellers } from "@baga/db";
import { BoughtPrompt } from "@/components/BoughtPrompt";

type Props = { params: Promise<{ locale: string; code: string }>; searchParams: Promise<{ a?: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "bought" });
  return { title: t("question"), robots: { index: false, follow: false } };
}

/** Where the "Вы купили?" email's answer links land: one press records the answer (mail scanners only open it). */
export default async function BoughtPage({ params, searchParams }: Props) {
  const { locale, code } = await params;
  const { a } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("bought");
  const sql = getSql();
  const found = sql && /^[A-Za-z0-9_-]{16,64}$/.test(code) ? await getBoughtByCode(sql, code) : null;
  const sellers = sql && found?.externalId ? await productSellers(sql, found.externalId).catch(() => []) : [];
  const suggested = a === "yes" || a === "later" || a === "no" ? a : undefined;
  return (
    <main className="wrap untracked">
      <article className="receipt">
        {found ? (
          <BoughtPrompt title={found.title ?? (found.externalId ? `№ ${found.externalId}` : "—")} by={{ code }}
            href={found.externalId ? `/p/${found.externalId}` : undefined} suggested={suggested} answered={found.bought} sellers={sellers} />
        ) : (
          <p className="untracked-status">{t("notFound")}</p>
        )}
      </article>
    </main>
  );
}
