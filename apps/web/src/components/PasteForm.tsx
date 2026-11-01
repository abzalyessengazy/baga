"use client";
import { useTranslations, useLocale } from "next-intl";
import { useEffect, useId, useRef, useState, forwardRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { Turnstile } from "./Turnstile";
import { CatalogList, type CatalogListItem } from "./CatalogList";

const DRAFT_KEY = "baga.pasteDraft";
const read = () => { try { return sessionStorage.getItem(DRAFT_KEY) ?? ""; } catch { return ""; } };
const write = (v: string) => { try { sessionStorage.setItem(DRAFT_KEY, v); } catch { /* storage unavailable */ } };

type ErrorCode = "not_a_url" | "not_kaspi" | "not_a_product" | "short_link" | "check_failed" | "too_many" | "generic";
const isShortLink = (v: string) => /l\.kaspi\.kz\//i.test(v);
/** Links go to /api/resolve; anything else searches BAGA's own catalog. */
const looksLikeLink = (v: string) => /https?:\/\/|www\.|kaspi\.kz|\.kz\//i.test(v);

/** One field for both: paste a Kaspi link, or type a product name to search what BAGA already tracks. */
export const PasteForm = forwardRef<HTMLInputElement>(function PasteForm(_, ref) {
  const t = useTranslations("home");
  const te = useTranslations("errors");
  const tp = useTranslations("product");
  const router = useRouter();
  const id = useId();
  const locale = useLocale() as "ru" | "kk";
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  // Search results for typed text: null = not searched (or a link); [] = nothing found.
  const [results, setResults] = useState<CatalogListItem[] | null>(null);
  // Turnstile is only needed for l.kaspi.kz short links; armed on first focus, so visitors who never use the
  // form do not load Cloudflare's script.
  const [armed, setArmed] = useState(false);
  const [widgetKey, setWidgetKey] = useState(0);
  const token = useRef<string | null>(null);

  useEffect(() => setValue(read()), []);

  // Debounced catalog search while typing text (not a link).
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2 || looksLikeLink(q)) { setResults(null); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = (await res.json()) as { items?: CatalogListItem[] };
        setResults(data.items ?? []);
      } catch {
        /* aborted or offline: keep the previous results */
      }
    }, 250);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [value]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    if (!looksLikeLink(q)) {
      // Text: open the best match, or say the catalog has nothing yet.
      if (results?.[0]) { write(""); router.push(`/p/${results[0].externalId}`); }
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const short = isShortLink(q);
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: q, token: short ? token.current : undefined }),
      });
      if (short) { token.current = null; setWidgetKey((k) => k + 1); } // tokens are single-use
      const data = (await res.json()) as { productId?: string; slug?: string | null; error?: ErrorCode };
      if (data.productId) {
        write("");
        router.push(`/p/${data.productId}${data.slug ? `?s=${encodeURIComponent(data.slug)}` : ""}`);
        return;
      }
      setError(data.error ?? "generic");
    } catch {
      setError("generic");
    }
    setBusy(false);
  }

  const showSearch = results !== null && !error;
  return (
    <form className="paste" onSubmit={submit} noValidate role="search">
      <label htmlFor={id} className="sr-only">{t("pasteLabel")}</label>
      <div className="paste-row">
        <input
          ref={ref} id={id} inputMode="search" autoComplete="off" spellCheck={false}
          placeholder={t("pastePlaceholder")} value={value}
          onFocus={() => setArmed(true)}
          onChange={(e) => { setValue(e.target.value); write(e.target.value); setError(null); setArmed(true); }}
          aria-invalid={error ? true : undefined} aria-describedby={`${id}-msg`}
          aria-controls={showSearch ? `${id}-results` : undefined}
        />
        <button className="btn" type="submit" disabled={busy}>{busy ? t("checking") : t("pasteButton")}</button>
      </div>
      <p id={`${id}-msg`} className={error ? "paste-error" : "paste-hint"} role={error ? "alert" : undefined}>
        {error ? te(error) : t("pasteHint")}
      </p>
      {showSearch && (
        <div id={`${id}-results`} className="search-panel" aria-live="polite">
          {results.length > 0 ? (
            <>
              <p className="note">{t("searchCount", { count: results.length })}</p>
              <CatalogList items={results} locale={locale} outOfStock={tp("outOfStock")} onPick={() => write("")} />
            </>
          ) : (
            <p className="note">{t("searchNone")}</p>
          )}
        </div>
      )}
      {armed && <Turnstile key={widgetKey} action="resolve" locale={locale} onToken={(v) => { token.current = v; }} />}
    </form>
  );
});
