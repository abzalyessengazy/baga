"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ShopFeedback } from "@/components/ShopFeedback";

type Answer = "yes" | "later" | "no";

/**
 * "Вы купили?" with three answers (migration 0011). `by` is the link's code (email page) or the tracking id (this
 * browser's "Мои товары"). `suggested` is the answer the email link was pressed for: highlighted, still one press.
 */
export function BoughtPrompt({ title, by, href, suggested, answered, sellers }: {
  title: string; by: { code: string } | { trackingId: string }; href?: string; suggested?: Answer; answered?: Answer | null;
  /** The product's current sellers, for "Как прошла покупка?" after "yes". */
  sellers?: { sellerId: string; name: string }[];
}) {
  const t = useTranslations("bought");
  const [answer, setAnswer] = useState<Answer | null>(answered ?? null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function send(a: Answer) {
    setBusy(true);
    setFailed(false);
    const res = await fetch("/api/bought", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answer: a, ...by }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) setAnswer(a); else setFailed(true);
  }

  const options: [Answer, string][] = [["yes", t("yes")], ["later", t("later")], ["no", t("no")]];
  return (
    <div className="bought">
      <p className="channel-title">{t("question")}</p>
      <p className="bought-name">{href ? <Link href={href}>{title}</Link> : title}</p>
      {answer ? (
        <>
          <p className="channel-text" role="status">
            {t(answer === "yes" ? "thanksYes" : answer === "later" ? "thanksLater" : "thanksNo")}
          </p>
          {answer === "yes" && <ShopFeedback by={by} sellers={sellers ?? []} />}
        </>
      ) : (
        <>
          <p className="channel-text">{t("why")}</p>
          <div className="bought-options">
            {options.map(([a, label]) => (
              <button key={a} type="button" disabled={busy} onClick={() => send(a)}
                className={(suggested ?? "yes") === a ? "btn btn-stamp" : "btn btn-ghost"}>{label}</button>
            ))}
          </div>
          {failed && <p className="form-msg is-error" role="alert">{t("failed")}</p>}
        </>
      )}
    </div>
  );
}
