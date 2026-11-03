"use client";
import { useTranslations, useLocale } from "next-intl";
import { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Turnstile } from "./Turnstile";

type ErrorCode = "check_failed" | "check_blocked" | "too_many" | "generic";

/**
 * For a product we don't track yet: passes Turnstile, asks /api/lookup to queue it for the collector, then
 * refreshes so the page shows when the price will appear. No Kaspi request is made here or by the server.
 */
export function ProductLookup({ id, slug }: { id: string; slug: string | null }) {
  const t = useTranslations("product");
  const te = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<ErrorCode | null>(null);
  const [attempt, setAttempt] = useState(0);
  const sent = useRef(false);

  async function request(token: string | null) {
    if (!token || sent.current) return;
    sent.current = true;
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, slug, token }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (data.ok) { router.refresh(); return; }
      // A first rejected token is often a stale or early one: try once more with a fresh check before saying so.
      if (data.error === "check_failed" && attempt === 0) return retry();
      setError(data.error === "check_failed" || data.error === "too_many" ? data.error : "generic");
    } catch {
      setError("generic");
    }
  }

  function retry() {
    sent.current = false;
    setError(null);
    setAttempt((n) => n + 1); // remount the widget for a fresh token
  }

  if (error) {
    return (
      <>
        <p className="untracked-status" role="alert">{te(error)}</p>
        <button className="btn" type="button" onClick={retry} style={{ marginTop: 12 }}>{t("lookupRetry")}</button>
      </>
    );
  }
  return (
    <>
      <p className="untracked-status is-working" role="status" aria-live="polite">{t("lookingUp")}<span className="dots" aria-hidden /></p>
      <Turnstile key={attempt} action="lookup" locale={locale} onToken={request} onError={(why) => setError(why === "blocked" ? "check_blocked" : "check_failed")} />
    </>
  );
}
