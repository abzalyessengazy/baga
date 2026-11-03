"use client";
import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";

/** "Написать нам": free text to the feedback table, tied to the product page it was sent from. No account needed. */
export function Feedback() {
  const t = useTranslations("feedback");
  const tf = useTranslations("footer");
  const path = usePathname();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const trap = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 3) { setMsg(t("tooShort")); return; }
    setState("busy");
    setMsg(null);
    const product = /^\/p\/(\d{5,12})(\/|$)/.exec(path)?.[1] ?? null;
    const res = await fetch("/api/feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, product, website: trap.current?.value ?? "" }),
    }).catch(() => null);
    if (res?.ok) { setState("sent"); setText(""); return; }
    setState("idle");
    setMsg(res?.status === 429 ? t("tooMany") : res?.status === 400 ? t("tooShort") : t("failed"));
  }

  if (!open) {
    return (
      <p><button type="button" className="link-btn" onClick={() => { setOpen(true); setState("idle"); setMsg(null); }}>{tf("feedback")}</button></p>
    );
  }
  return (
    <div className="receipt feedback">
      {state === "sent" ? (
        <>
          <p className="feedback-thanks" role="status">{t("thanks")}</p>
          <button type="button" className="link-btn" onClick={() => setOpen(false)}>{t("close")}</button>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor={id}>{t("title")}</label>
            <textarea id={id} rows={4} maxLength={2000} value={text} placeholder={t("placeholder")} autoFocus
              onChange={(e) => setText(e.target.value)} />
          </div>
          {/* Left empty by people; bots that fill every field are dropped by the API. */}
          <input ref={trap} name="website" className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <p className="note" style={{ marginTop: 0 }}>{t("hint")}</p>
          {msg && <p className="form-msg is-error" role="alert">{msg}</p>}
          <div className="feedback-actions">
            <button className="btn" type="submit" disabled={state === "busy"}>{t("submit")}</button>
            <button type="button" className="link-btn" onClick={() => setOpen(false)}>{t("close")}</button>
          </div>
        </form>
      )}
    </div>
  );
}
