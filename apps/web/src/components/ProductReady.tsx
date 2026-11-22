"use client";
import { useEffect } from "react";
import { useLocale } from "next-intl";

/**
 * The cached product page and its per-request waiting page (DECISIONS.md, 2026-11-16 "Cached product pages").
 * ToWait: on the cached page of a product with no price yet, go to /p/<id>/wait with the same ?s=, replacing the entry
 * so Back skips it. ProductReady: on the waiting page once the price is saved, refresh the cached page, then open it.
 */
export function ToWait({ id }: { id: string }) {
  const locale = useLocale();
  useEffect(() => { window.location.replace(`/${locale}/p/${id}/wait${window.location.search}`); }, [id, locale]);
  return <p className="untracked-status is-working" role="status"><span className="dots" aria-hidden /></p>;
}

export function ProductReady({ id }: { id: string }) {
  const locale = useLocale();
  useEffect(() => {
    const go = () => window.location.replace(`/${locale}/p/${id}`);
    fetch("/api/product-fresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      .catch(() => null).finally(go);
  }, [id, locale]);
  return <p className="untracked-status is-working" role="status"><span className="dots" aria-hidden /></p>;
}
