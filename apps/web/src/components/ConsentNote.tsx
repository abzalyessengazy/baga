"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/** Under the alert channels: connecting Telegram or email means agreeing to the privacy policy. */
export function ConsentNote() {
  const t = useTranslations("legal");
  return <p className="note">{t.rich("consent", { privacy: (c) => <Link href="/privacy">{c}</Link> })}</p>;
}
