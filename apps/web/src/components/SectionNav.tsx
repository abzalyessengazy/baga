"use client";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

// The catalog holds the drops too (its «Подешевели» list), so /drops counts as the catalog (the owner, 10 Nov 2026).
type Section = { href: string; key: "explore" | "shops" | "myItems"; also: readonly string[] };
const SECTIONS: Section[] = [
  { href: "/explore", key: "explore", also: ["/drops"] },
  { href: "/shops", key: "shops", also: [] },
];
const MY: Section = { href: "/my", key: "myItems", also: [] };

const isOn = (path: string, s: Section) => [s.href, ...s.also].some((h) => path === h || path.startsWith(`${h}/`));

/**
 * The header's sections on desktop (the owner, 10 Nov 2026): «Каталог · Продавцы» beside the logo. Phones keep the
 * original header (logo, «Мои товары», language) and reach the sections from the footer: every phone variant tried
 * (a text row, a segmented bar, icons with captions, a menu) looked cheap there.
 */
export function SectionNav() {
  const t = useTranslations("nav");
  return (
    <nav className="section-nav" aria-label={t("sections")}>
      {SECTIONS.map((s) => <SectionLink key={s.key} s={s} label={t(s.key)} />)}
    </nav>
  );
}

/** «Мои товары» on every screen. */
export function MyItemsLink() {
  const t = useTranslations("nav");
  const path = usePathname();
  return <Link href={MY.href} aria-current={isOn(path, MY) ? "page" : undefined} className="nav-my">{t("myItems")}</Link>;
}

function SectionLink({ s, label }: { s: Section; label: string }) {
  const path = usePathname();
  return <Link href={s.href} aria-current={isOn(path, s) ? "page" : undefined}>{label}</Link>;
}
