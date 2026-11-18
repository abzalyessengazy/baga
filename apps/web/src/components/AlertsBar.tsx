"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { loadMyProfile, PROFILE_EVENT } from "@/lib/profileClient";
import { track } from "@/lib/analytics";

const HIDDEN = "baga.alertsBar";

/**
 * A bar under the header for someone who tracks products but connected neither Telegram nor email (the owner, 16 Nov:
 * 30 of 45 people who started tracking that day could never get an alert). One tap opens the bot; email is set up in
 * «Мои товары». Hidden there (that page says it itself) and on /admin; «Скрыть» hides it until the next visit. It goes
 * away by itself once a channel is connected (checked again when the visitor comes back from the Telegram app).
 */
export function AlertsBar() {
  const t = useTranslations("alertsBar");
  const path = usePathname();
  const [state, setState] = useState<{ count: number; url: string | null; pending: string | null } | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try { setHidden(sessionStorage.getItem(HIDDEN) === "1"); } catch { setHidden(false); }
    let live = true;
    const check = (fresh = false) => loadMyProfile(fresh).then((me) => {
      if (!live) return;
      const a = me?.alerts, n = me?.stats?.tracked ?? 0;
      setState(a && !a.telegram && !a.email && !a.push && n > 0 && !me?.profile?.internal ? { count: n, url: a.telegramUrl, pending: a.emailPending ?? null } : null);
    });
    check();
    // The email form or the bot changed something on this page: read again.
    const changed = () => check(true);
    window.addEventListener(PROFILE_EVENT, changed);
    const back = () => { if (document.visibilityState === "visible") check(true); };
    document.addEventListener("visibilitychange", back);
    return () => { live = false; document.removeEventListener("visibilitychange", back); window.removeEventListener(PROFILE_EVENT, changed); };
  }, []);

  if (!state || hidden || /\/(my|admin)(\/|$)/.test(path ?? "")) return null;
  const hide = () => { setHidden(true); try { sessionStorage.setItem(HIDDEN, "1"); } catch { /* private mode */ } };
  return (
    <div className="alerts-bar" role="status">
      <p className="alerts-bar-text"><span aria-hidden>🔔</span> {state.pending ? t("pending", { email: state.pending }) : t("text", { count: state.count })}</p>
      <div className="alerts-bar-actions">
        {state.url && (
          <a className="btn btn-stamp alerts-bar-tg" href={state.url} target="_blank" rel="noopener" onClick={() => track("channel_tap", { detail: "telegram_bar" })}>{t("telegram")}</a>
        )}
        {!state.pending && <Link className="alerts-bar-mail" href="/my#alerts">{t("email")}</Link>}
        <button type="button" className="alerts-bar-close" onClick={hide} aria-label={t("close")} title={t("close")}>×</button>
      </div>
    </div>
  );
}
