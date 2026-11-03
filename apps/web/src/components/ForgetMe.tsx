"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";

/** "Удалить мои данные" on "Мои товары": deletes this visitor's watcher and everything hanging off it. */
export function ForgetMe() {
  const t = useTranslations("my");
  const [step, setStep] = useState<"idle" | "confirm" | "busy" | "done">("idle");
  const [failed, setFailed] = useState(false);

  async function forget() {
    setStep("busy");
    setFailed(false);
    const res = await fetch("/api/my", { method: "DELETE" }).catch(() => null);
    if (res?.ok) { setStep("done"); setTimeout(() => window.location.reload(), 1500); }
    else { setStep("confirm"); setFailed(true); }
  }

  if (step === "done") return <p className="note" role="status">{t("forgetDone")}</p>;
  if (step === "idle") return <button type="button" className="link-btn forget-btn" onClick={() => setStep("confirm")}>{t("forget")}</button>;
  return (
    <div className="forget" role="alertdialog" aria-label={t("forget")}>
      <p className="channel-text">{t("forgetText")}</p>
      <div className="track-actions">
        <button type="button" className="btn" onClick={forget} disabled={step === "busy"}>{t("forgetConfirm")}</button>
        <button type="button" className="link-btn" onClick={() => setStep("idle")}>{t("forgetCancel")}</button>
      </div>
      {failed && <p className="form-msg is-error" role="alert">{t("forgetFailed")}</p>}
    </div>
  );
}
