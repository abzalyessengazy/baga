"use client";
import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge } from "@baga/core";
import { TearCoupon } from "./TearCoupon";

/** Tear the coupon off the receipt to open the tracking form, pre-filled 10% below today's price. */
export function TrackPanel({ productId, current }: { productId: string; current: number | null }) {
  const t = useTranslations("track");
  const tr = useTranslations("receipt");
  const locale = useLocale() as "ru" | "kk";
  const id = useId();
  const suggested = current ? Math.round((current * 0.9) / 1000) * 1000 - 10 : null;
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(suggested ? String(suggested) : "");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(target.replace(/\D/g, ""));
    if (!n || (current !== null && n >= current)) return setMsg({ text: t("invalidTarget"), error: true });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setMsg({ text: t("invalidEmail"), error: true });
    setBusy(true);
    const res = await fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, productId, target: n, locale }) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { code?: string } | null;
    setBusy(false);
    if (data?.code === "waitlisted") setMsg({ text: t("waitlisted", { email: email.trim() }) });
    else if (data?.code === "invalid_email") setMsg({ text: t("invalidEmail"), error: true });
    else setMsg({ text: t("notReady") });
  }

  return (
    <div className="side-panel">
      <div className="perforation" aria-hidden />
      {!open ? (
        <TearCoupon onTorn={() => setTimeout(() => setOpen(true), 450)}>
          <div className="coupon-head"><span>{tr("couponLabel")}</span><span>№ {productId.slice(-4)}</span></div>
          <div className="coupon-price">{suggested ? formatTenge(suggested, locale) : "—"}</div>
          <div className="coupon-hint">{tr("couponDrag")}</div>
        </TearCoupon>
      ) : (
        <form className="track-card" onSubmit={submit} noValidate>
          <h2>{t("title")}</h2>
          <div className="field">
            <label htmlFor={`${id}-t`}>{t("targetLabel")}</label>
            <input id={`${id}-t`} inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} autoFocus />
            {suggested && <small>{t("suggested")}</small>}
          </div>
          <div className="field">
            <label htmlFor={`${id}-e`}>{t("emailLabel")}</label>
            <input id={`${id}-e`} type="email" autoComplete="email" placeholder={t("emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn btn-stamp" type="submit" disabled={busy} style={{ width: "100%" }}>{t("submit")}</button>
          {msg && <p className={`form-msg${msg.error ? " is-error" : ""}`} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
          <p className="note">{t("privacy")}</p>
        </form>
      )}
    </div>
  );
}
