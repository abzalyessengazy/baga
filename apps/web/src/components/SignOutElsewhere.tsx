"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * «Выйти на других устройствах» on "Мои товары" (DECISIONS.md, 2026-11-16 "Sign-in links in alerts"): other browsers
 * that came in through a link in an alert lose access, and the links in earlier messages stop signing in.
 */
export function SignOutElsewhere() {
  const t = useTranslations("my");
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  async function go() {
    setState("busy");
    const res = await fetch("/api/my/elsewhere", { method: "POST" }).catch(() => null);
    setState(res?.ok ? "done" : "failed");
  }
  if (state === "done") return <p className="note" role="status">{t("elsewhereDone")}</p>;
  return (
    <>
      <button type="button" className="link-btn forget-btn" onClick={go} disabled={state === "busy"} title={t("elsewhereHint")}>{t("elsewhere")}</button>
      {state === "failed" && <p className="form-msg is-error" role="alert">{t("forgetFailed")}</p>}
    </>
  );
}
