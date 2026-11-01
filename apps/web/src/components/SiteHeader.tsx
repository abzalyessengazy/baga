import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";

export function SiteHeader() {
  return (
    <header className="wrap site-header">
      <Link href="/" className="logo" aria-label="BAGA">BAGA</Link>
      <LocaleSwitcher />
    </header>
  );
}
