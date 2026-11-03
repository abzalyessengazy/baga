import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSql, weekMovers, type Mover } from "@baga/db";
import { MoversList } from "@/components/MoversList";

type Props = { params: Promise<{ locale: string }> };
// New prices arrive once a day; an hour of caching is plenty and keeps the database quiet.
export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "drops" });
  return {
    title: t("title"), description: t("metaDescription"),
    alternates: { canonical: `/${locale}/drops`, languages: { "ru-KZ": "/ru/drops", "kk-KZ": "/kk/drops", "x-default": "/ru/drops" } },
  };
}

/** Week movers (packages/db/src/movers.ts): what got cheaper or dearer, by our own daily checks. */
export default async function DropsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("drops");
  const sql = getSql();
  let down: Mover[] = [], up: Mover[] = [];
  if (sql) [down, up] = await Promise.all([weekMovers(sql, "down", 40), weekMovers(sql, "up", 20)]).catch(() => [[], []] as Mover[][]);
  const L = locale as "ru" | "kk";
  const was = (price: string) => t("was", { price });
  return (
    <main className="wrap untracked">
      <h1 className="product-title" style={{ color: "var(--ink-on-counter, var(--ink))" }}>{t("title")}</h1>
      <p className="drops-intro">{t("intro")}</p>
      {down.length + up.length === 0 ? (
        <article className="receipt"><p className="untracked-status">{t("none")}</p></article>
      ) : (
        <>
          {down.length > 0 && (<><h2 className="drops-h">↓ {t("down")}</h2><MoversList items={down} locale={L} was={was} /></>)}
          {up.length > 0 && (<><h2 className="drops-h">↑ {t("up")}</h2><MoversList items={up} locale={L} was={was} /></>)}
        </>
      )}
    </main>
  );
}
