import { getTranslations } from "next-intl/server";
import { SUPPORT_EMAIL } from "@/lib/site";

type Section = { h: string; items: string[] };

/** The privacy policy and the terms: text from messages (legal.<doc>), one receipt with numbered sections. */
export async function LegalDoc({ doc }: { doc: "privacy" | "terms" }) {
  const t = await getTranslations("legal");
  const sections = t.raw(`${doc}.sections`) as Section[];
  return (
    <main className="wrap untracked">
      <h1 className="product-title" style={{ color: "var(--ink-on-counter, var(--ink))" }}>{t(`${doc}.title`)}</h1>
      <article className="receipt legal">
        <p className="legal-updated">{t("updated")}</p>
        <p>{t(`${doc}.intro`)}</p>
        {sections.map((s, i) => (
          <section key={s.h}>
            <h2>{i + 1}. {s.h}</h2>
            <ul>{s.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        ))}
        <section>
          <h2>{sections.length + 1}. {t("contactH")}</h2>
          <p>{t("contactText")} <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
        </section>
      </article>
    </main>
  );
}
