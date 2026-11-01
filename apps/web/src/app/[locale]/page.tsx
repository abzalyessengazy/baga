import { getTranslations, setRequestLocale } from "next-intl/server";
import { HomeHero } from "@/components/HomeHero";
import { Highlights } from "@/components/Highlights";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  return (
    <main>
      <HomeHero />
      <Highlights />
      <section className="wrap section">
        <h2 className="section-title">{t("howTitle")}</h2>
        <ol className="how" style={{ marginTop: 28 }}>
          <li>{t("how1")}</li>
          <li>{t("how2")}</li>
          <li>{t("how3")}</li>
        </ol>
      </section>
      <section className="wrap section trust">
        <h2 className="section-title">{t("trustTitle")}</h2>
        <p>{t("trustText")}</p>
      </section>
      <footer className="wrap site-footer">{t("footer")}</footer>
    </main>
  );
}
