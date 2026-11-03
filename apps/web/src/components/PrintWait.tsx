"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const STEPS = ["printing1", "printing2", "printing3"] as const;

/**
 * While a product page loads: the receipt printer at work, one line per step. The steps follow what really
 * happens (link read, product looked up in BAĞA, page put together) and the last one stays until the page is there.
 */
export function PrintWait() {
  const t = useTranslations("product");
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 900);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="print-wait" role="status" aria-live="polite">
      <div className="print-head" aria-hidden><span /></div>
      <ul className="print-lines">
        {STEPS.slice(0, step + 1).map((k, i) => (
          <li key={k} className={i < step ? "is-done" : "is-now"}>
            <span className="print-mark" aria-hidden>{i < step ? "✓" : ""}</span>{t(k)}
          </li>
        ))}
      </ul>
      <div className="print-skeleton" aria-hidden><span /><span /><span /></div>
    </div>
  );
}
