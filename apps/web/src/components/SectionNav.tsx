"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

// The catalog holds the drops too (its «Подешевели» list), so /drops counts as the catalog (the owner, 10 Nov 2026).
type Section = { href: string; key: "home" | "explore" | "shops" | "myItems"; also: readonly string[] };
const HOME: Section = { href: "/", key: "home", also: [] };
const SECTIONS: Section[] = [
  { href: "/explore", key: "explore", also: ["/drops"] },
  { href: "/shops", key: "shops", also: [] },
];
const MY: Section = { href: "/my", key: "myItems", also: [] };

const isOn = (path: string, s: Section) =>
  s.href === "/" ? path === "/" : [s.href, ...s.also].some((h) => path === h || path.startsWith(`${h}/`));

/**
 * The header's sections (the owner, 10 Nov 2026). Desktop: «Каталог · Продавцы» beside the logo. «Мои товары» stays a
 * quick link on every screen. Phones: a menu button opens a small panel with «Главная · Каталог · Продавцы», so the
 * way back home is there too.
 */
export function SectionNav() {
  const t = useTranslations("nav");
  return (
    <nav className="section-nav" aria-label={t("sections")}>
      {SECTIONS.map((s) => <SectionLink key={s.key} s={s} label={t(s.key)} />)}
    </nav>
  );
}

/** «Мои товары» on every screen; phones show the short word when the full one does not fit (Kazakh). */
export function MyItemsLink() {
  const t = useTranslations("nav");
  const path = usePathname();
  return (
    <Link href={MY.href} aria-current={isOn(path, MY) ? "page" : undefined} className="nav-my" aria-label={t("myItems")}>
      <span className="nav-my-full">{t("myItems")}</span><span className="nav-my-short" aria-hidden>{t("myItemsShort")}</span>
    </Link>
  );
}

function SectionLink({ s, label }: { s: Section; label: string }) {
  const path = usePathname();
  return <Link href={s.href} aria-current={isOn(path, s) ? "page" : undefined}>{label}</Link>;
}

export function MobileMenu() {
  const t = useTranslations("nav");
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Close on navigation, Escape and a tap outside.
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const tap = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", tap);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", tap); };
  }, [open]);
  return (
    <div className="menu" ref={box}>
      <button type="button" className="menu-btn" aria-expanded={open} aria-controls="site-menu" aria-label={open ? t("menuClose") : t("menu")}
        onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {open ? <path d="M5 5l10 10M15 5 5 15" /> : <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />}
        </svg>
      </button>
      {open && (
        <nav id="site-menu" className="menu-panel" aria-label={t("sections")}>
          {[HOME, ...SECTIONS].map((s) => (
            <Link key={s.key} href={s.href} aria-current={isOn(path, s) ? "page" : undefined} onClick={() => setOpen(false)}>
              {t(s.key)}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
