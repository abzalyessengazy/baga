"use client";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const SECTIONS = [
  { href: "/drops", key: "drops" },
  { href: "/explore", key: "explore" },
  { href: "/shops", key: "shops" },
] as const;

/**
 * The three browsing sections in the header (the owner, 10 Nov 2026: they were only in the footer): plain text,
 * no icons, so the paste form stays the main thing; the current section is underlined in stamp violet.
 */
export function SectionNav() {
  const t = useTranslations("nav");
  const path = usePathname();
  return (
    <nav className="section-nav" aria-label={t("sections")}>
      {SECTIONS.map((s) => {
        const on = path === s.href || path.startsWith(`${s.href}/`);
        return <Link key={s.key} href={s.href} aria-current={on ? "page" : undefined}>{t(s.key)}</Link>;
      })}
    </nav>
  );
}
