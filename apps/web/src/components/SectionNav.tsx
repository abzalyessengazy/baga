"use client";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { NavIcon } from "./NavIcon";

// The catalog holds the drops too (its «Подешевели» list), so /drops counts as the catalog (the owner, 10 Nov 2026).
const SECTIONS = [
  { href: "/explore", key: "explore", icon: "catalog", also: ["/drops"] },
  { href: "/shops", key: "shops", icon: "shops", also: [] },
] as const;

/**
 * The browsing sections in the header (the owner, 10 Nov 2026: they were only in the footer). Words on desktop,
 * icons on phones beside «Мои товары» and the language switch; the current section is in stamp violet.
 */
export function SectionNav() {
  const t = useTranslations("nav");
  const path = usePathname();
  return (
    <nav className="section-nav" aria-label={t("sections")}>
      {SECTIONS.map((s) => {
        const on = [s.href, ...s.also].some((h) => path === h || path.startsWith(`${h}/`));
        return (
          <Link key={s.key} href={s.href} aria-current={on ? "page" : undefined} title={t(s.key)} className="nav-link">
            <NavIcon name={s.icon} /><span className="nav-txt">{t(s.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
