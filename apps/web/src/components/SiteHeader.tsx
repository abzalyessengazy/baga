import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { Wordmark } from "./Wordmark";
import { SectionNav } from "./SectionNav";

export async function SiteHeader() {
  const t = await getTranslations("nav");
  return (
    <header className="wrap site-header">
      <Link href="/" className="logo"><Wordmark /></Link>
      <SectionNav />
      <nav className="site-nav">
        <Link href="/my" className="nav-my">{t("myItems")}</Link>
        <LocaleSwitcher />
      </nav>
    </header>
  );
}
