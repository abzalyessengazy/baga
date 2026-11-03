"use client";
import { useTranslations } from "next-intl";
import { PasteForm } from "./PasteForm";
import { MarketReceipt } from "./MarketReceipt";
import { MyStrip } from "./MyStrip";

export function HomeHero() {
  const t = useTranslations("home");
  return (
    <section className="wrap hero">
      <div className="hero-copy">
        <h1 className="headline">{t("headline")}</h1>
        <p className="subline">{t("subline")}</p>
        <PasteForm />
        <MyStrip />
      </div>
      <MarketReceipt />
    </section>
  );
}
