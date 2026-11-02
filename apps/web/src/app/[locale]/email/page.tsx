import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ confirm?: string; stop?: string; done?: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "emailPage" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

const isToken = (v: string | undefined): v is string => !!v && /^[A-Za-z0-9_-]{16,64}$/.test(v);

/**
 * Where links in emails land (DECISIONS.md, 2026-11-02 "Email alerts with confirmation"): confirm an address or
 * unsubscribe. Both need a button press (a POST), so a mail scanner opening the link changes nothing.
 */
export default async function EmailPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("emailPage");
  const { confirm, stop, done } = await searchParams;

  let body: React.ReactNode;
  if (done === "confirmed" || done === "stopped" || done === "invalid") {
    body = (
      <>
        <p className="untracked-status">{t(done)}</p>
        <Link className="btn" href={done === "confirmed" ? "/my" : "/"}>{done === "confirmed" ? t("toMy") : t("toHome")}</Link>
      </>
    );
  } else if (isToken(confirm)) {
    body = (
      <form method="post" action="/api/email/confirm">
        <p className="untracked-status">{t("confirmText")}</p>
        <input type="hidden" name="t" value={confirm} />
        <input type="hidden" name="l" value={locale} />
        <button className="btn btn-stamp" type="submit">{t("confirmButton")}</button>
      </form>
    );
  } else if (isToken(stop)) {
    body = (
      <form method="post" action="/api/email/stop">
        <p className="untracked-status">{t("stopText")}</p>
        <input type="hidden" name="c" value={stop} />
        <input type="hidden" name="l" value={locale} />
        <button className="btn" type="submit">{t("stopButton")}</button>
      </form>
    );
  } else {
    body = <p className="untracked-status">{t("invalid")}</p>;
  }

  return (
    <main className="wrap untracked">
      <h1 className="product-title" style={{ color: "var(--ink-on-counter, var(--ink))" }}>{t("title")}</h1>
      <article className="receipt">{body}</article>
    </main>
  );
}
