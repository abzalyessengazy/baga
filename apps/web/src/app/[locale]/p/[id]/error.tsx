"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * The cached product page throws for a product with no price yet (unknown or queued) and for a database hiccup, so
 * neither is stored in the cache (DECISIONS.md 2026-11-20 "Audit leftovers fixed"). The browser goes on to
 * /p/<id>/wait, rendered per request, with the same ?s=, replacing the entry so Back skips it. Once a minute at most per
 * product: if the waiting page sends it back and this page fails again (the database is down), the visitor gets a
 * retry button instead of a loop.
 */
export default function ProductError() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const t = useTranslations();
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const key = `baga-wait-${id}`;
    let recent = false;
    try {
      recent = Date.now() - Number(sessionStorage.getItem(key) ?? 0) < 60_000;
      sessionStorage.setItem(key, String(Date.now()));
    } catch { /* storage blocked: go on */ }
    if (recent) setStuck(true);
    else window.location.replace(`/${locale}/p/${id}/wait${window.location.search}`);
  }, [id, locale]);
  return (
    <main className="wrap untracked">
      {stuck ? (
        <>
          <p className="subline" role="alert">{t("errors.generic")}</p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>{t("product.lookupRetry")}</button>
        </>
      ) : <p className="untracked-status is-working" role="status"><span className="dots" aria-hidden /></p>}
    </main>
  );
}
