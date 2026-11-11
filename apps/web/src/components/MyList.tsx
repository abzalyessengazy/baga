"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatTenge } from "@baga/core";
import { Link } from "@/i18n/navigation";

export interface MyItem { trackingId: string; href: string; name: string; imageUrl: string | null; targetPrice: number | null; targetDropPct: number | null; currentMinPrice: number | null }

type Reason = "bought" | "bought_elsewhere" | "changed_mind" | "price_never_dropped";
const REASONS: [Reason, string][] = [
  ["bought", "removeBought"], ["bought_elsewhere", "removeElsewhere"], ["changed_mind", "removeChangedMind"], ["price_never_dropped", "removeWaited"],
];

/**
 * The visitor's tracked products: today's observed price against their target. «Убрать» first asks why, in the row
 * (owner, 11 Nov 2026): one tap answers and removes; «Просто убрать» removes without an answer, «Оставить» keeps it.
 */
export function MyList({ items, locale }: { items: MyItem[]; locale: "ru" | "kk" }) {
  const t = useTranslations("my");
  const [list, setList] = useState(items);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const f = (n: number) => formatTenge(n, locale);

  async function remove(id: string, reason: Reason | null) {
    setBusy(true);
    setFailed(false);
    const q = reason ? `&reason=${reason}` : "";
    const res = await fetch(`/api/track?id=${id}${q}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (res?.ok) { setList((l) => l.filter((i) => i.trackingId !== id)); setAsking(null); } else setFailed(true);
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
            {asking !== i.trackingId && (
              <button type="button" className="link-btn" onClick={() => { setAsking(i.trackingId); setFailed(false); }}
                aria-label={t("removeLabel", { name: i.name })}>{t("remove")}</button>
            )}
            {asking === i.trackingId && (
              <div className="remove-ask" role="group" aria-label={t("removeAsk")}>
                <p className="channel-title">{t("removeAsk")}</p>
                <p className="channel-text">{t("removeWhy")}</p>
                <div className="bought-options">
                  {REASONS.map(([r, key]) => (
                    <button key={r} type="button" className="btn btn-ghost" disabled={busy} onClick={() => remove(i.trackingId, r)}>{t(key)}</button>
                  ))}
                </div>
                <div className="remove-ask-foot">
                  <button type="button" className="link-btn" disabled={busy} onClick={() => remove(i.trackingId, null)}>{t("removeSkip")}</button>
                  <button type="button" className="link-btn" disabled={busy} onClick={() => setAsking(null)}>{t("removeCancel")}</button>
                </div>
                {failed && <p className="form-msg is-error" role="alert">{t("removeFailed")}</p>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
