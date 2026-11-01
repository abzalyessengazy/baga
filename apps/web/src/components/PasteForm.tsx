"use client";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, forwardRef } from "react";
import { useRouter } from "@/i18n/navigation";

const DRAFT_KEY = "baga.pasteDraft";
const read = () => { try { return sessionStorage.getItem(DRAFT_KEY) ?? ""; } catch { return ""; } };
const write = (v: string) => { try { sessionStorage.setItem(DRAFT_KEY, v); } catch { /* storage unavailable */ } };

type ErrorCode = "not_a_url" | "not_kaspi" | "not_a_product" | "short_link" | "generic";

export const PasteForm = forwardRef<HTMLInputElement>(function PasteForm(_, ref) {
  const t = useTranslations("home");
  const te = useTranslations("errors");
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);

  useEffect(() => setValue(read()), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: value }) });
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
          onChange={(e) => { setValue(e.target.value); write(e.target.value); setError(null); }}
          aria-invalid={error ? true : undefined} aria-describedby={`${id}-msg`}
        />
        <button className="btn" type="submit" disabled={busy}>{busy ? t("checking") : t("pasteButton")}</button>
      </div>
      <p id={`${id}-msg`} className={error ? "paste-error" : "paste-hint"} role={error ? "alert" : undefined}>
        {error ? te(error) : t("pasteHint")}
      </p>
    </form>
  );
});
