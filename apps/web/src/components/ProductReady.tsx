"use client";
import { useEffect } from "react";
import { useLocale } from "next-intl";

/**
 * The cached product page and its per-request waiting page (DECISIONS.md, 2026-11-16 "Cached product pages").
 * A product with no price yet goes from the cached page to /p/<id>/wait (app/[locale]/p/[id]/error.tsx). ProductReady:
 * on the waiting page once the price is saved, refresh the cached page, then open it.
 */

export function ProductReady({ id }: { id: string }) {
  const locale = useLocale();
  useEffect(() => {
    const go = () => window.location.replace(`/${locale}/p/${id}`);
    fetch("/api/product-fresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      .catch(() => null).finally(go);
  }, [id, locale]);
  return <p className="untracked-status is-working" role="status"><span className="dots" aria-hidden /></p>;
}
