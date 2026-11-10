import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { Wordmark } from "./Wordmark";
import { SectionNav } from "./SectionNav";
import { NavIcon } from "./NavIcon";

export async function SiteHeader() {
  const t = await getTranslations("nav");
  return (
    <header className="wrap site-header">
      <Link href="/" className="logo"><Wordmark /></Link>
      <SectionNav />
      <nav className="site-nav">
        <Link href="/my" className="nav-my nav-link" title={t("myItems")}><NavIcon name="my" /><span className="nav-txt">{t("myItems")}</span></Link>
        <LocaleSwitcher />
      </nav>
    </header>
  );
}
