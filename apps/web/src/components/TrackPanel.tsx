"use client";
import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { DROP_PRESETS, formatTenge, targetForDrop } from "@baga/core";
import { Link } from "@/i18n/navigation";
import { TearCoupon } from "./TearCoupon";
import { EmailConnect, type EmailInitial } from "./EmailConnect";

export interface TrackInitial {
  /** dropPct: a percentage target waiting for the product's first price (migration 0010). */
  target: number | null; dropPct: number | null; linked: boolean; telegramUrl: string | null; botReady: boolean;
  email: EmailInitial; emailReady: boolean;
}

/**
 * Tear the coupon off the receipt to set your price: one tap on a drop range (5–10%, 10–25%, 25% or more) or
 * your own number. Tracking starts at once, before registration exists; alerts go to Telegram and/or a confirmed
 * email address (DECISIONS.md, 2026-11-02). `current` is null while the product waits for its first price: a
 * range is then saved as a percentage and becomes a price with the first one (DECISIONS.md, 2026-11-03).
 * `related` (similar products others track) appears once a price is set.
 */
export function TrackPanel({ productId, shortLink, current, initial, related }: {
  productId: string; current: number | null; initial: TrackInitial;
  /** On a short link's waiting page: the tracking waits on the link until the collector resolves it. */
  shortLink?: string;
  related?: React.ReactNode;
}) {
  const t = useTranslations("track");
  const tr = useTranslations("receipt");
  const locale = useLocale() as "ru" | "kk";
  const id = useId();
  const reduce = useReducedMotion();
  const f = (n: number) => formatTenge(n, locale);
  // Without a price yet, every range is offered and saved as a percentage (target null).
  const presets = DROP_PRESETS
    .map((p) => ({ ...p, target: current === null ? null : targetForDrop(current, p.from) }))
    .filter((p) => current === null || p.target !== null);
  type Saved = { price: number | null; pct: number | null };
  const [tracked, setTracked] = useState<Saved | null>(
    initial.target !== null || initial.dropPct !== null ? { price: initial.target, pct: initial.dropPct } : null);
  const [just, setJust] = useState(false); // set in this visit: play the stamp and show the related products
  const [tg, setTg] = useState({ linked: initial.linked, url: initial.telegramUrl });
  // A product still waiting for its first price has nothing to tear off: show the form at once, so the visitor
  // sees straight away that they can set a price and get the first one sent to them.
  const [open, setOpen] = useState(current === null);
  const [custom, setCustom] = useState(initial.target !== null && !presets.some((p) => p.target === initial.target));
  const [target, setTarget] = useState(String(initial.target ?? ""));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // the button being saved

  async function track(want: { price: number } | { dropPct: number }, key: string) {
    if ("price" in want && (!want.price || (current !== null && want.price >= current))) return setMsg(t("invalidTarget"));
    setBusy(key);
    setMsg(null);
    const body = { ...(shortLink ? { shortLink } : { productId }), ...("price" in want ? { target: want.price } : { dropPct: want.dropPct }), locale };
    const res = await fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { code?: string; target?: number | null; dropPct?: number | null; linked?: boolean; telegramUrl?: string | null } | null;
    setBusy(null);
    if (data?.code === "tracking") {
      setTracked({ price: data.target ?? null, pct: data.dropPct ?? null });
      setJust(true);
      setOpen(false);
      setTg({ linked: !!data.linked, url: data.telegramUrl ?? null });
    } else setMsg(data?.code === "limit" ? t("limit") : data?.code === "rate_limited" ? t("tooMany") : t("notReady"));
  }

  const swap = reduce
    ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0 } } }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.22, ease: "easeOut" as const } };

  const form = (
    <motion.form key="form" className="track-card" onSubmit={(e) => { e.preventDefault(); track({ price: Number(target.replace(/\D/g, "")) }, "custom"); }} noValidate {...swap}>
      <h2>{t("title")}</h2>
      {current === null && <p className="note" style={{ margin: "0 0 12px" }}>{t("queuedFormNote")}</p>}
      {presets.length > 0 && (
        <>
          <p className="preset-label" id={`${id}-p`}>{t("presetsLabel")}</p>
          <div className="presets" role="group" aria-labelledby={`${id}-p`}>
            {presets.map((p, i) => (
              <motion.button key={p.from} type="button" className={`preset${busy === `p${p.from}` ? " is-busy" : ""}`} disabled={busy !== null}
                onClick={() => { setCustom(false); track(p.target !== null ? { price: p.target } : { dropPct: p.from }, `p${p.from}`); }}
                initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.06 }}
                whileTap={reduce ? undefined : { scale: 0.97 }}>
                <span className="preset-pct">{p.to ? t("presetRange", { from: p.from, to: p.to }) : t("presetMore", { from: p.from })}</span>
                <span className="preset-price">{p.target !== null ? t("presetTarget", { price: f(p.target) }) : t("presetFromFirst")}</span>
              </motion.button>
            ))}
            <motion.button type="button" className={`preset preset-custom${custom ? " is-on" : ""}`} aria-expanded={custom} disabled={busy !== null}
              onClick={() => setCustom((c) => !c)}
              initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + presets.length * 0.06 }}>
              <span className="preset-pct">{t("presetCustom")}</span>
              <span className="preset-price">{t("presetCustomHint")}</span>
            </motion.button>
          </div>
        </>
      )}
      <AnimatePresence initial={false}>
        {custom && (
          <motion.div key="custom" className="custom-target" initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="field">
              <label htmlFor={`${id}-t`}>{t("targetLabel")}</label>
              <input id={`${id}-t`} inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} autoFocus />
            </div>
            <button className={`btn btn-stamp${busy !== null ? " is-busy" : ""}`} type="submit" disabled={busy !== null} style={{ width: "100%" }}>{t("submit")}</button>
          </motion.div>
        )}
      </AnimatePresence>
      {msg && <p className="form-msg is-error" role="alert">{msg}</p>}
    </motion.form>
  );

  const done = tracked !== null && !open ? (
    <motion.div key="tracked" className="track-card" role="status" {...swap}>
      <motion.span className="stamp" initial={just && !reduce ? { scale: 1.9, opacity: 0, rotate: -14 } : false}
        animate={{ scale: 1, opacity: 0.92, rotate: -4 }} transition={{ type: "spring", stiffness: 520, damping: 17, delay: 0.1 }}>
        {t("trackingStamp")}
      </motion.span>
      <p className="track-target">
        {just && (
          <svg className="track-check" viewBox="0 0 24 24" aria-hidden>
            <motion.path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
              initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.35 }} />
          </svg>
        )}
        {tracked.price !== null ? t("yourTarget", { price: f(tracked.price) }) : t("yourDrop", { pct: tracked.pct ?? 0 })}
      </p>
      <p className="note">{tracked.price === null ? t("dropNote") : current === null ? t("firstPriceNote") : t("targetNote")}</p>
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
    </motion.div>
  ) : null;

  return (
    <div className="side-panel">
      <div className="perforation" aria-hidden />
      <AnimatePresence mode="wait" initial={false}>
        {done ?? (!open ? (
          <motion.div key="coupon" exit={{ opacity: 0, transition: { duration: 0 } }}>
            <TearCoupon onTorn={() => setTimeout(() => setOpen(true), 450)}>
              <div className="coupon-head"><span>{tr("couponLabel")}</span><span>№ {productId.slice(-4)}</span></div>
              <div className="coupon-price">{presets[1]?.target != null ? f(presets[1].target) : "—"}</div>
              <div className="coupon-hint">{tr("couponDrag")}</div>
            </TearCoupon>
          </motion.div>
        ) : form)}
      </AnimatePresence>
      <AnimatePresence>
        {related && tracked !== null && (
          <motion.div key="related" className="related" initial={just && !reduce ? { opacity: 0, y: 24 } : false} animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 24, delay: just ? 0.7 : 0 }} data-pop={just ? "" : undefined}>
            {related}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
