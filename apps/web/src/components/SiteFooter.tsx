import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SUPPORT_EMAIL } from "@/lib/site";
import { Feedback } from "./Feedback";
import { GUIDES, GUIDE_SLUGS } from "@/lib/guides";

/** On every page: the feedback form, legal pages, the Kaspi disclaimer and the support address. */
export async function SiteFooter() {
  const t = await getTranslations("footer");
  const tg = await getTranslations("guide");
  return (
    <footer className="wrap site-footer">
      <Feedback />
      <p><Link href="/drops">{t("drops")}</Link> · <Link href="/explore">{t("explore")}</Link> · <Link href="/shops">{t("shops")}</Link> · <Link href="/privacy">{t("privacy")}</Link> · <Link href="/terms">{t("terms")}</Link></p>
      {/* The guides (18 Nov): on every page, so search engines and visitors find them. */}
      <p>{GUIDE_SLUGS.map((g, i) => <span key={g}>{i > 0 && " · "}<Link href={`/guide/${g}`}>{tg(`${GUIDES[g]}.nav`)}</Link></span>)}</p>
      <p>{t("disclaimer")}</p>
      <p>{t("contact")} <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> · {t("since")}</p>
    </footer>
  );
}
