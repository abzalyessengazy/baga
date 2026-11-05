import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SUPPORT_EMAIL } from "@/lib/site";
import { Feedback } from "./Feedback";

/** On every page: the feedback form, legal pages, the Kaspi disclaimer and the support address. */
export async function SiteFooter() {
  const t = await getTranslations("footer");
  return (
    <footer className="wrap site-footer">
      <Feedback />
      <p><Link href="/drops">{t("drops")}</Link> · <Link href="/explore">{t("explore")}</Link> · <Link href="/privacy">{t("privacy")}</Link> · <Link href="/terms">{t("terms")}</Link></p>
      <p>{t("disclaimer")}</p>
      <p>{t("contact")} <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> · {t("since")}</p>
    </footer>
  );
}
