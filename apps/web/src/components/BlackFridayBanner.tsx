"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BLACK_FRIDAY, salePhase, type SalePhase } from "@baga/core";
import { Link } from "@/i18n/navigation";

/** A strip on the home page while the Black Friday check is up (until BLACK_FRIDAY.showUntil, Almaty date). */
export function BlackFridayBanner() {
  const t = useTranslations("bf");
  const [phase, setPhase] = useState<SalePhase | null>(null);
  useEffect(() => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date());
    setPhase(salePhase(today));
  }, []);
  if (!phase) return null;
  const dates = { start: BLACK_FRIDAY.start.slice(8, 10), end: BLACK_FRIDAY.end.slice(8, 10) };
  return (
    <div className="wrap bf-banner-wrap">
      <Link href="/black-friday" className="bf-banner">
        <span className="bf-banner-tag">{t("bannerTag")}</span>
        <span className="bf-banner-text">{t(phase === "before" ? "bannerBefore" : phase === "during" ? "bannerDuring" : "bannerAfter", dates)}</span>
        <span className="bf-banner-go" aria-hidden>→</span>
      </Link>
    </div>
  );
}
