"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge } from "@baga/core";
import { Link } from "@/i18n/navigation";

type Item = { trackingId: string; href: string; imageUrl: string | null; name: string; targetPrice: number | null; currentMinPrice: number | null };

/** On the home page, for a returning visitor: the first few tracked products and a link to the whole list. */
export function MyStrip() {
  const t = useTranslations("my");
  const locale = useLocale() as "ru" | "kk";
  const [data, setData] = useState<{ count: number; items: Item[] } | null>(null);

  useEffect(() => {
    fetch(`/api/my/items?l=${locale}`).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => undefined);
  }, [locale]);

  if (!data || data.count === 0) return null;
  const f = (n: number) => formatTenge(n, locale);
  return (
    <section className="my-strip" aria-label={t("homeTitle")}>
      <h2 className="my-strip-title">{t("homeTitle")}</h2>
      <ul className="catalog-list">
        {data.items.map((i) => (
          <li key={i.trackingId}>
            <Link href={i.href} className="catalog-item">
              {i.imageUrl ? <img src={i.imageUrl} alt="" width={40} height={40} loading="lazy" /> : <span className="catalog-thumb" aria-hidden />}
              <span className="catalog-title">{i.name}</span>
              <span className="catalog-price">{i.currentMinPrice !== null ? f(i.currentMinPrice) : t("waiting")}</span>
            </Link>
          </li>
        ))}
      </ul>
      {data.count > data.items.length && <Link href="/my" className="my-strip-all">{t("homeAll", { count: data.count })}</Link>}
    </section>
  );
}
