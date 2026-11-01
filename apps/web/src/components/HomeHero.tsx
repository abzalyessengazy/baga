"use client";
import { useRef } from "react";
import { useTranslations } from "next-intl";
import { PasteForm } from "./PasteForm";
import { HeroReceipt } from "./HeroReceipt";

export function HomeHero() {
  const t = useTranslations("home");
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="wrap hero">
      <div className="hero-copy">
        <h1 className="headline">{t("headline")}</h1>
        <p className="subline">{t("subline")}</p>
        <PasteForm ref={input} />
      </div>
      <HeroReceipt onTorn={() => setTimeout(() => input.current?.focus({ preventScroll: false }), 500)} />
    </section>
  );
}
