import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="wrap error-page">
      <h1 className="section-title">{t("notFoundTitle")}</h1>
      <p className="subline">{t("notFoundText")}</p>
      <Link className="btn" href="/">{t("backHome")}</Link>
    </main>
  );
}
