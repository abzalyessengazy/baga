"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatTenge } from "@baga/core";
import { Link } from "@/i18n/navigation";

export interface MyItem { trackingId: string; href: string; name: string; imageUrl: string | null; targetPrice: number | null; targetDropPct: number | null; currentMinPrice: number | null }

/** The visitor's tracked products: today's observed price against their target; stop tracking in one tap. */
export function MyList({ items, locale }: { items: MyItem[]; locale: "ru" | "kk" }) {
  const t = useTranslations("my");
  const [list, setList] = useState(items);
  const f = (n: number) => formatTenge(n, locale);

  async function remove(id: string) {
    const res = await fetch(`/api/track?id=${id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setList((l) => l.filter((i) => i.trackingId !== id));
  }

  if (!list.length) return <p className="untracked-status">{t("empty")}</p>;
  return (
    <ul className="my-list">
      {list.map((i) => {
        const hit = i.currentMinPrice !== null && i.targetPrice !== null && i.currentMinPrice <= i.targetPrice;
        return (
          <li key={i.trackingId} className="my-item">
            {i.imageUrl ? <img src={i.imageUrl} alt="" width={48} height={48} loading="lazy" /> : <span className="ph" />}
            <div>
              <Link href={i.href} className="my-title">{i.name}</Link>
              <div className="my-prices">
                {i.currentMinPrice !== null
                  ? <span className={hit ? "is-hit" : undefined}>{t("now", { price: f(i.currentMinPrice) })}</span>
                  : <span>{t("waiting")}</span>}
                {" · "}{i.targetPrice !== null ? t("target", { price: f(i.targetPrice) }) : t("targetDrop", { pct: i.targetDropPct ?? 0 })}
              </div>
            </div>
            <button type="button" className="link-btn" onClick={() => remove(i.trackingId)} aria-label={t("removeLabel", { name: i.name })}>{t("remove")}</button>
          </li>
        );
      })}
    </ul>
  );
}
