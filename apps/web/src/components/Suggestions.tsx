"use client";
import { motion } from "motion/react";
import { useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge, shortTitle } from "@baga/core";
import type { Suggestion } from "@baga/db";
import { Link } from "@/i18n/navigation";
import { useReplay } from "./Motion";

/**
 * «Почему бы не следить и за этими?» under the visitor's list: products they do not track, from the categories they
 * already watch or named, furthest below their own 30-day high first. Observed prices only, with what they are
 * compared to said in the row.
 */
export function Suggestions({ items }: { items: Suggestion[] }) {
  const t = useTranslations("profile");
  const locale = useLocale() as "ru" | "kk";
  const ref = useRef<HTMLUListElement>(null);
  const go = useReplay(ref, 0.1);
  if (!items.length) return null;
  const f = (n: number) => formatTenge(n, locale);
  return (
    <section className="suggest">
      <h2>{t("suggestTitle")}</h2>
      <p className="suggest-lead">{t("suggestLead")}</p>
      <ul className="catalog-list movers" ref={ref}>
        {items.map((s, i) => (
          <motion.li key={s.externalId} initial={false} animate={go ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
            transition={go ? { type: "spring", stiffness: 320, damping: 30, delay: i * 0.06 } : { duration: 0 }}>
            <Link href={`/p/${s.externalId}`} className="catalog-item">
              {s.imageUrl ? <img src={s.imageUrl} alt="" width={40} height={40} loading="lazy" /> : <span className="catalog-thumb" aria-hidden />}
              <span className="catalog-title">
                {shortTitle((locale === "kk" && s.titleKk) || s.title)}
                <small>{s.pct > 0 ? t("suggestWas", { high: f(s.high) }) : t("suggestFlat", { days: s.observedDays })}</small>
              </span>
              <span className="catalog-price">
                {f(s.price)}
                {s.pct > 0 && <small className="is-down">−{s.pct}%</small>}
              </span>
            </Link>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
