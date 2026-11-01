"use client";
import { useTranslations, useLocale } from "next-intl";
import { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Turnstile } from "./Turnstile";

type ErrorCode = "check_failed" | "not_found" | "unavailable" | "too_many" | "generic";

/** Shown for a product we don't have yet: passes Turnstile, asks /api/lookup to fetch it once, then reloads. */
export function ProductLookup({ id }: { id: string }) {
  const t = useTranslations("product");
  const te = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<ErrorCode | null>(null);
  const [attempt, setAttempt] = useState(0);
  const sent = useRef(false);

  async function lookup(token: string | null) {
    if (!token || sent.current) return;
    sent.current = true;
    try {
      const res = await fetch("/api/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, token }) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: ErrorCode };
      if (data.ok) { router.refresh(); return; }
      setError(data.error ?? "generic");
    } catch {
      setError("generic");
    }
  }

  function retry() {
    sent.current = false;
    setError(null);
    setAttempt((n) => n + 1); // remount the widget for a fresh token
  }

  const message = !error ? null
    : error === "not_found" ? t("notFound")
    : error === "unavailable" ? t("unavailable")
    : te(error);

  return (
    <main className="wrap error-page">
      {!error && <p className="subline" role="status" aria-live="polite">{t("lookingUp")}</p>}
      {!error && <p className="paste-hint">{t("lookupNote")}</p>}
      {!error && <Turnstile key={attempt} action="lookup" locale={locale} onToken={lookup} onError={() => setError("check_failed")} />}
      {message && <p className="subline" role="alert">{message}</p>}
      {error && error !== "not_found" && <button className="btn" type="button" onClick={retry}>{t("lookupRetry")}</button>}
    </main>
  );
}
