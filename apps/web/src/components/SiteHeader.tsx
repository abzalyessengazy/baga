import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { Wordmark } from "./Wordmark";
import { SectionNav, MyItemsLink } from "./SectionNav";

export function SiteHeader() {
  return (
    <header className="wrap site-header">
      <Link href="/" className="logo"><Wordmark /></Link>
      <SectionNav />
      <div className="site-nav">
        <MyItemsLink />
        <LocaleSwitcher />
      </div>
    </header>
  );
}
