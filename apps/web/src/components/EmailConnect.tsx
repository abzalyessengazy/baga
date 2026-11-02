"use client";
import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Turnstile } from "./Turnstile";

export interface EmailInitial { address: string | null; confirmed: boolean }

/**
 * Email alerts next to Telegram (DECISIONS.md, 2026-11-02 "Email alerts with confirmation"): the visitor types an
 * address, we send a confirmation link, and alerts start once it is opened. `removable` adds "stop emails".
 */
export function EmailConnect({ initial, removable = false }: { initial: EmailInitial; removable?: boolean }) {
  const t = useTranslations("emailAlerts");
  const te = useTranslations("errors");
  const locale = useLocale();
  const id = useId();
  const [state, setState] = useState<"form" | "sent" | "confirmed">(
    initial.address ? (initial.confirmed ? "confirmed" : "sent") : "form",
  );
  const [address, setAddress] = useState(initial.address ?? "");
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return setMsg(t("checking"));
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/email", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address, locale, token }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { code?: string; email?: string } | null;
    setBusy(false);
    setToken(null);
    setAttempt((n) => n + 1); // tokens are single-use
    if (data?.code === "sent" || data?.code === "confirmed") {
      setAddress(data.email ?? address);
      setState(data.code);
    } else {
      const code = data?.code;
      setMsg(code === "invalid_email" ? t("invalid") : code === "too_soon" ? t("tooSoon") : code === "too_many" || code === "rate_limited"
        ? t("tooMany") : code === "check_failed" ? te("check_failed") : t("notReady"));
    }
  }

  async function remove() {
    const res = await fetch("/api/email", { method: "DELETE" }).catch(() => null);
    if (res?.ok) { setState("form"); setAddress(""); }
  }

  if (state !== "form") {
    return (
      <div className="email-connect">
        <p className="note">{state === "confirmed" ? t("confirmed", { email: address }) : t("sent", { email: address })}</p>
        <div className="track-actions">
          <button type="button" className="link-btn" onClick={() => setState("form")}>{t("change")}</button>
          {removable && <button type="button" className="link-btn" onClick={remove}>{t("remove")}</button>}
        </div>
      </div>
    );
  }

  return (
    <form className="email-connect" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-e`}>{t("label")}</label>
        <input id={`${id}-e`} type="email" inputMode="email" autoComplete="email" value={address}
          onChange={(e) => setAddress(e.target.value)} placeholder="name@mail.kz" />
      </div>
      <button className="btn" type="submit" disabled={busy || !address.trim()} style={{ width: "100%" }}>{t("submit")}</button>
      <Turnstile key={attempt} action="email" locale={locale} onToken={setToken}
        onError={(why) => setMsg(te(why === "blocked" ? "check_blocked" : "check_failed"))} />
      {msg && <p className="form-msg is-error" role="alert">{msg}</p>}
      <p className="note">{t("hint")}</p>
    </form>
  );
}
