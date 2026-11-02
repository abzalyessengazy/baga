"use client";
import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTenge } from "@baga/core";
import { Link } from "@/i18n/navigation";
import { TearCoupon } from "./TearCoupon";
import { EmailConnect, type EmailInitial } from "./EmailConnect";

export interface TrackInitial {
  target: number | null; linked: boolean; telegramUrl: string | null; botReady: boolean;
  email: EmailInitial; emailReady: boolean;
}

/**
 * Tear the coupon off the receipt to set your price (pre-filled 10% below today's when we have one). Tracking
 * starts at once, before registration exists; alerts go to Telegram and/or a confirmed email address
 * (DECISIONS.md, 2026-11-02).
 * `current` is null while the product waits for its first price.
 */
export function TrackPanel({ productId, shortLink, current, initial }: {
  productId: string; current: number | null; initial: TrackInitial;
  /** On a short link's waiting page: the tracking waits on the link until the collector resolves it. */
  shortLink?: string;
}) {
  const t = useTranslations("track");
  const tr = useTranslations("receipt");
  const locale = useLocale() as "ru" | "kk";
  const id = useId();
  const suggested = current ? Math.round((current * 0.9) / 1000) * 1000 - 10 : null;
  const [tracked, setTracked] = useState<number | null>(initial.target);
  const [tg, setTg] = useState({ linked: initial.linked, url: initial.telegramUrl });
  // A product still waiting for its first price has nothing to tear off: show the form at once, so the visitor
  // sees straight away that they can set a price and get the first one sent to them.
  const [open, setOpen] = useState(current === null);
  const [target, setTarget] = useState(String(initial.target ?? suggested ?? ""));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(target.replace(/\D/g, ""));
    if (!n || (current !== null && n >= current)) return setMsg(t("invalidTarget"));
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(shortLink ? { shortLink } : { productId }), target: n, locale }) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { code?: string; linked?: boolean; telegramUrl?: string | null } | null;
    setBusy(false);
    if (data?.code === "tracking") {
      setTracked(n);
      setOpen(false);
      setTg({ linked: !!data.linked, url: data.telegramUrl ?? null });
    } else setMsg(data?.code === "limit" ? t("limit") : data?.code === "rate_limited" ? t("tooMany") : t("notReady"));
  }

  const form = (
    <form className="track-card" onSubmit={submit} noValidate>
      <h2>{t("title")}</h2>
      {current === null && <p className="note" style={{ margin: "0 0 12px" }}>{t("queuedFormNote")}</p>}
      <div className="field">
        <label htmlFor={`${id}-t`}>{t("targetLabel")}</label>
        <input id={`${id}-t`} inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} autoFocus={current !== null} />
        {suggested && <small>{t("suggested")}</small>}
      </div>
      <button className="btn btn-stamp" type="submit" disabled={busy} style={{ width: "100%" }}>{t("submit")}</button>
      {msg && <p className="form-msg is-error" role="alert">{msg}</p>}
    </form>
  );

  if (tracked !== null && !open) {
    return (
      <div className="side-panel">
        <div className="perforation" aria-hidden />
        <div className="track-card" role="status">
          <span className="stamp">{t("trackingStamp")}</span>
          <p className="track-target">{t("yourTarget", { price: formatTenge(tracked, locale) })}</p>
          <p className="note">{current === null ? t("firstPriceNote") : t("targetNote")}</p>
          {tg.linked ? (
            <p className="note">{t("telegramLinked")}</p>
          ) : tg.url ? (
            <>
              <a className="btn btn-stamp" href={tg.url} target="_blank" rel="noopener" style={{ width: "100%" }}>{t("telegramConnect")}</a>
              <p className="note">{t("telegramHint")}</p>
            </>
          ) : initial.botReady ? (
            <p className="note">{t("telegramLinked")}</p>
          ) : !initial.emailReady ? (
            <p className="note">{t("telegramSoon")}</p>
          ) : null}
          {initial.emailReady && (
            <>
              {(tg.url || tg.linked || initial.botReady) && <p className="or-rule"><span>{t("or")}</span></p>}
              <EmailConnect initial={initial.email} />
            </>
          )}
          <div className="track-actions">
            <button type="button" className="link-btn" onClick={() => setOpen(true)}>{t("change")}</button>
            <Link href="/my">{t("myItems")}</Link>
          </div>
        </div>
      </div>
    );
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
      ) : form}
    </div>
  );
}
