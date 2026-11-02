"use client";
import { useEffect, useRef } from "react";

// Cloudflare Turnstile widget (DECISIONS.md, 2026-11-01). The script loads only where this component renders.
// Without NEXT_PUBLIC_TURNSTILE_SITE_KEY, development uses Cloudflare's always-pass test key.
const SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || (process.env.NODE_ENV !== "production" ? "1x00000000000000000000AA" : "");

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window { turnstile?: TurnstileApi }
}

let loading: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    s.onerror = () => { loading = null; reject(new Error("turnstile")); };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Invisible unless Cloudflare needs the visitor to interact. Calls onToken with a fresh single-use token,
 * or null when it expires. Remount (change `key`) to get a new token after one was used.
 */
export function Turnstile({ action, locale, onToken, onError }: {
  action: "lookup" | "resolve";
  locale: string;
  onToken: (token: string | null) => void;
  /** "blocked": the script did not load (often an ad blocker); "failed": Cloudflare kept failing the check. */
  onError?: (reason: "blocked" | "failed") => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onToken, onError });
  handlers.current = { onToken, onError };

  useEffect(() => {
    if (!SITE_KEY) { handlers.current.onError?.("failed"); return; }
    let id: string | null = null;
    let cancelled = false;
    // Turnstile retries by itself after a failed attempt; give up only after several failures in a row.
    let failures = 0;
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !box.current) return;
        id = ts.render(box.current, {
          sitekey: SITE_KEY,
          action,
          appearance: "interaction-only",
          // Turnstile has Russian; for Kazakh it follows the browser language.
          language: locale === "ru" ? "ru" : "auto",
          callback: (t: string) => { failures = 0; handlers.current.onToken(t); },
          "expired-callback": () => handlers.current.onToken(null),
          "error-callback": () => {
            if (++failures >= 3) handlers.current.onError?.("failed");
            return false; // let Turnstile log the error code and retry
          },
        });
      })
      .catch(() => handlers.current.onError?.("blocked"));
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [action, locale]);

  return <div ref={box} className="turnstile" />;
}
