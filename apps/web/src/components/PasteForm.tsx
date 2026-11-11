"use client";
import { useTranslations, useLocale } from "next-intl";
import { useEffect, useId, useRef, useState, forwardRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { Turnstile } from "./Turnstile";
import { CatalogList, type CatalogListItem } from "./CatalogList";
import { track } from "@/lib/analytics";
import { pasteOutcome } from "@baga/core";

const DRAFT_KEY = "baga.pasteDraft";
const read = () => { try { return sessionStorage.getItem(DRAFT_KEY) ?? ""; } catch { return ""; } };
const write = (v: string) => { try { sessionStorage.setItem(DRAFT_KEY, v); } catch { /* storage unavailable */ } };

type ErrorCode = "not_a_url" | "not_kaspi" | "not_a_product" | "short_link" | "check_failed" | "check_blocked" | "too_many" | "generic";
/** Links that need the bot check: short links, and variant links (id ending in letters) the collector resolves. */
const isShortLink = (v: string) => /l\.kaspi\.kz\/|\/shop\/p\/[^\s?#]*\d{5,12}[a-z]{1,3}\/?(?:[?#\s]|$)/i.test(v);
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
  // Submits waiting for the bot check: on a phone the link is often pasted and sent before Turnstile has finished.
  const waiters = useRef<((t: string | null) => void)[]>([]);
  const blocked = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setInput = (el: HTMLInputElement | null) => {
    inputRef.current = el;
    if (typeof ref === "function") ref(el); else if (ref) ref.current = el;
  };

  function onToken(v: string | null) {
    token.current = v;
    if (v) waiters.current.splice(0).forEach((f) => f(v));
  }
  function onCheckError(why: "blocked" | "failed") {
    blocked.current = why === "blocked";
    waiters.current.splice(0).forEach((f) => f(null));
  }
  /** A fresh token, waiting up to 15 s for the widget. Takes it, so the next request gets a new one. */
  function takeToken(): Promise<string | null> {
    const ready = token.current;
    if (ready) { token.current = null; setWidgetKey((k) => k + 1); return Promise.resolve(ready); }
    setArmed(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 15_000);
      waiters.current.push((t) => {
        clearTimeout(timer);
        token.current = null;
        setWidgetKey((k) => k + 1); // tokens are single-use
        resolve(t);
      });
    });
  }

  useEffect(() => setValue(read()), []);
  // The paste button needs the async Clipboard API (all current browsers; the browser may ask once).
  const [canPaste, setCanPaste] = useState(false);
  useEffect(() => setCanPaste(typeof navigator !== "undefined" && !!navigator.clipboard?.readText), []);

  const [clipFailed, setClipFailed] = useState(false);
  /**
   * Reads the clipboard on tap with readText() only: one call, one system «Вставить» bubble on phones (the phone's
   * own privacy check; it cannot be skipped). 8 Nov: a read()-first version was slow on iPhone and, when it found no
   * text, its readText() fallback showed a second bubble and the check no longer started by itself. Reverted.
   */
  async function readClipboard(): Promise<string> {
    try { return (await navigator.clipboard.readText()).trim(); } catch { return ""; }
  }
  async function pasteFromClipboard() {
    const text = await readClipboard();
    if (!text) { setClipFailed(true); inputRef.current?.focus(); return; }
    setClipFailed(false);
    setValue(text); write(text); setError(null); setArmed(true);
    if (looksLikeLink(text)) void check(text);
    else inputRef.current?.focus();
  }

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
    await check(q);
  }

  async function check(q: string) {
    setBusy(true);
    setError(null);
    // The paste event carries its outcome (docs/STATS.md, "KPI definitions"); sent once the answer is known.
    try {
      const short = isShortLink(q);
      const send = async () => {
        const res = await fetch("/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: q, token: short ? await takeToken() : undefined }),
        });
        return (await res.json()) as { productId?: string; slug?: string | null; pendingLink?: string; error?: ErrorCode };
      };
      let data = await send();
      // One quiet retry with a fresh check before telling the visitor anything.
      if (short && data.error === "check_failed" && !blocked.current) data = await send();
      if (data.error === "check_failed" && blocked.current) data.error = "check_blocked";
      track("paste", { detail: pasteOutcome(data) });
      if (data.productId) {
        write("");
        router.push(`/p/${data.productId}${data.slug ? `?s=${encodeURIComponent(data.slug)}` : ""}`);
        return;
      }
      if (data.pendingLink) { write(""); router.push(`/l/${encodeURIComponent(data.pendingLink)}`); return; }
      setError(data.error ?? "generic");
    } catch {
      track("paste", { detail: pasteOutcome("network") });
      setError("generic");
    }
    setBusy(false);
  }

  const showSearch = results !== null && !error;
  return (
    <form className="paste" onSubmit={submit} noValidate role="search">
      <label htmlFor={id} className="sr-only">{t("pasteLabel")}</label>
      <div className="paste-row">
        <div className="paste-field">
        <input
          ref={setInput} id={id} inputMode="search" autoComplete="off" spellCheck={false}
          placeholder={t("pastePlaceholder")} value={value}
          onFocus={() => setArmed(true)}
          onChange={(e) => { setValue(e.target.value); write(e.target.value); setError(null); setArmed(true); }}
          aria-invalid={error ? true : undefined} aria-describedby={`${id}-msg`}
          aria-controls={showSearch ? `${id}-results` : undefined}
        />
        {canPaste && !value && (
          <button type="button" className="paste-clip" onClick={pasteFromClipboard} disabled={busy}>{t("pasteFromClipboard")}</button>
        )}
        </div>
        <button className="btn" type="submit" disabled={busy}>{busy ? t("checking") : t("pasteButton")}</button>
      </div>
      <p id={`${id}-msg`} className={error ? "paste-error" : "paste-hint"} role={error ? "alert" : undefined}>
        {error ? te(error) : clipFailed && !value ? t("pasteManual") : t("pasteHint")}
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
      {armed && <Turnstile key={widgetKey} action="resolve" locale={locale} onToken={onToken} onError={onCheckError} />}
    </form>
  );
});
