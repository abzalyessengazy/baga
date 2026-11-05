"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { SHOP_FEEDBACK, type ShopFeedbackOutcome } from "@baga/core";

/**
 * "Как прошла покупка?" after "Вы купили? — Да" (DECISIONS.md, 2026-11-05 "Shop evidence, not verdicts"): the shop
 * (optional, from the product's current sellers) and one outcome. Shown on the shop's page once it has
 * SHOP_FEEDBACK.minToShow answers.
 */
export function ShopFeedback({ by, sellers }: { by: { code: string } | { trackingId: string }; sellers: { sellerId: string; name: string }[] }) {
  const t = useTranslations("bought");
  const [seller, setSeller] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  async function send(outcome: ShopFeedbackOutcome) {
    setBusy(true);
    setFailed(false);
    const res = await fetch("/api/shop-feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, seller: seller || null, ...by }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) setDone(true); else setFailed(true);
  }

  if (done) return <p className="channel-text shop-feedback" role="status">{t("shopThanks")}</p>;
  return (
    <div className="shop-feedback">
      <p className="channel-title">{t("shopQuestion")}</p>
      <p className="channel-text">{t("shopWhy")}</p>
      {sellers.length > 0 && (
        <label className="shop-feedback-seller">
          <span>{t("shopWhich")}</span>
          <select value={seller} onChange={(e) => setSeller(e.target.value)} disabled={busy}>
            <option value="">{t("shopUnknown")}</option>
            {sellers.map((s) => <option key={s.sellerId} value={s.sellerId}>{s.name}</option>)}
          </select>
        </label>
      )}
      <div className="bought-options">
        {SHOP_FEEDBACK.outcomes.map((o) => (
          <button key={o} type="button" disabled={busy} onClick={() => send(o)} className="btn btn-ghost">{t(`outcome_${o}`)}</button>
        ))}
      </div>
      {failed && <p className="form-msg is-error" role="alert">{t("failed")}</p>}
    </div>
  );
}
