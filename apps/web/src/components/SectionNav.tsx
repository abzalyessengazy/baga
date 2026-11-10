"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

// The catalog holds the drops too (its «Подешевели» list), so /drops counts as the catalog (the owner, 10 Nov 2026).
const SECTIONS = [
  { href: "/explore", key: "explore", also: ["/drops"] },
  { href: "/shops", key: "shops", also: [] },
  { href: "/my", key: "myItems", also: [] },
] as const;

const isOn = (path: string, s: (typeof SECTIONS)[number]) => [s.href, ...s.also].some((h) => path === h || path.startsWith(`${h}/`));

/**
 * The header's sections (the owner, 10 Nov 2026). Desktop: «Каталог · Продавцы» beside the logo and «Мои товары» on
 * the right, in words. Phones: one menu button beside the language switch that opens a panel with the three in large
 * text (icons with captions were too small, and violet on the dark counter hard to read).
 */
export function SectionNav() {
  const t = useTranslations("nav");
  return (
    <nav className="section-nav" aria-label={t("sections")}>
      {SECTIONS.filter((s) => s.key !== "myItems").map((s) => <SectionLink key={s.key} s={s} label={t(s.key)} />)}
    </nav>
  );
}

export function MyItemsLink() {
  const t = useTranslations("nav");
  return <SectionLink s={SECTIONS[2]} label={t("myItems")} className="nav-my" />;
}

function SectionLink({ s, label, className }: { s: (typeof SECTIONS)[number]; label: string; className?: string }) {
  const path = usePathname();
  return <Link href={s.href} aria-current={isOn(path, s) ? "page" : undefined} className={className}>{label}</Link>;
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
          {SECTIONS.map((s) => (
            <Link key={s.key} href={s.href} aria-current={isOn(path, s) ? "page" : undefined} onClick={() => setOpen(false)}>
              <span>{t(s.key)}</span><span aria-hidden>→</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
