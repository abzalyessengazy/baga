"use client";
import { useTranslations, useLocale } from "next-intl";
import { useEffect, useId, useRef, useState, forwardRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { Turnstile } from "./Turnstile";

const DRAFT_KEY = "baga.pasteDraft";
const read = () => { try { return sessionStorage.getItem(DRAFT_KEY) ?? ""; } catch { return ""; } };
const write = (v: string) => { try { sessionStorage.setItem(DRAFT_KEY, v); } catch { /* storage unavailable */ } };

type ErrorCode = "not_a_url" | "not_kaspi" | "not_a_product" | "short_link" | "check_failed" | "too_many" | "generic";
const isShortLink = (v: string) => /l\.kaspi\.kz\//i.test(v);

export const PasteForm = forwardRef<HTMLInputElement>(function PasteForm(_, ref) {
  const t = useTranslations("home");
  const te = useTranslations("errors");
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  // Turnstile is only needed for l.kaspi.kz short links; it is armed on first focus so the landing page
  // does not load Cloudflare's script for visitors who never use the form.
  const locale = useLocale();
  const [armed, setArmed] = useState(false);
  const [widgetKey, setWidgetKey] = useState(0);
  const token = useRef<string | null>(null);

  useEffect(() => setValue(read()), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const short = isShortLink(value);
      const res = await fetch("/api/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: value, token: short ? token.current : undefined }) });
      if (short) { token.current = null; setWidgetKey((k) => k + 1); } // tokens are single-use
      const data = (await res.json()) as { productId?: string; error?: ErrorCode };
      if (data.productId) {
        write("");
        router.push(`/p/${data.productId}`);
        return;
      }
      setError(data.error ?? "generic");
    } catch {
      setError("generic");
    }
    setBusy(false);
  }

  return (
    <form className="paste" onSubmit={submit} noValidate>
      <label htmlFor={id} className="sr-only">{t("pasteLabel")}</label>
      <div className="paste-row">
        <input
          ref={ref} id={id} inputMode="url" autoComplete="off" spellCheck={false}
          placeholder={t("pastePlaceholder")} value={value}
          onFocus={() => setArmed(true)}
          onChange={(e) => { setValue(e.target.value); write(e.target.value); setError(null); setArmed(true); }}
          aria-invalid={error ? true : undefined} aria-describedby={`${id}-msg`}
        />
        <button className="btn" type="submit" disabled={busy}>{busy ? t("checking") : t("pasteButton")}</button>
      </div>
      <p id={`${id}-msg`} className={error ? "paste-error" : "paste-hint"} role={error ? "alert" : undefined}>
        {error ? te(error) : t("pasteHint")}
      </p>
      {armed && <Turnstile key={widgetKey} action="resolve" locale={locale} onToken={(t) => { token.current = t; }} />}
    </form>
  );
});
