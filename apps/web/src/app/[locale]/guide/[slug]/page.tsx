import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { GUIDES, GUIDE_SLUGS, isGuide } from "@/lib/guides";
import { siteUrl } from "@/lib/site";

type Props = { params: Promise<{ locale: string; slug: string }> };
type Block = { h: string; kind: "steps" | "list" | "text"; text: string[] };

/**
 * Guides that answer what people ask search engines and AI assistants (DECISIONS.md 2026-11-18 "Guides for search and
 * AI answers", the owner approved the texts): real explanations with observed examples, each ending with the link box.
 * Text in messages (guide.<key>); static, rebuilt only by a deploy.
 */
export const dynamicParams = false;
export function generateStaticParams() {
  return ["ru", "kk"].flatMap((locale) => GUIDE_SLUGS.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isGuide(slug)) return {};
  const t = await getTranslations({ locale, namespace: "guide" });
  const k = GUIDES[slug];
  return {
    title: t(`${k}.title`), description: t(`${k}.description`),
    alternates: { canonical: `/${locale}/guide/${slug}`, languages: { "ru-KZ": `/ru/guide/${slug}`, "kk-KZ": `/kk/guide/${slug}`, "x-default": `/ru/guide/${slug}` } },
    openGraph: { title: t(`${k}.title`), description: t(`${k}.description`), type: "article" },
  };
}

export default async function Page({ params }: Props) {
  const { locale, slug } = await params;
  if (!isGuide(slug)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("guide");
  const k = GUIDES[slug];
  const blocks = t.raw(`${k}.blocks`) as Block[];
  const others = GUIDE_SLUGS.filter((s) => s !== slug);
  // What the page is, for search engines and AI assistants: an article by BAĞA, in this language.
  const ld = {
    "@context": "https://schema.org", "@type": "Article", headline: t(`${k}.title`), description: t(`${k}.description`),
    inLanguage: locale === "kk" ? "kk-KZ" : "ru-KZ", dateModified: "2026-11-18",
    url: `${siteUrl()}/${locale}/guide/${slug}`, publisher: { "@type": "Organization", name: "BAĞA", url: siteUrl() },
  };
  return (
    <main className="wrap untracked">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <p className="bf-kicker">{t("label")}</p>
      <h1 className="product-title" style={{ color: "var(--ink-on-counter, var(--ink))" }}>{t(`${k}.title`)}</h1>
      <article className="receipt legal guide">
        <p className="guide-lead">{t(`${k}.lead`)}</p>
        {blocks.map((b) => (
          <section key={b.h}>
            <h2>{b.h}</h2>
            {b.kind === "steps" ? <ol>{b.text.map((x) => <li key={x}>{x}</li>)}</ol>
              : b.kind === "list" ? <ul>{b.text.map((x) => <li key={x}>{x}</li>)}</ul>
              : b.text.map((x) => <p key={x}>{x}</p>)}
          </section>
        ))}
        <p><Link href="/" className="btn btn-stamp guide-cta">{t("cta")}</Link></p>
        <p className="legal-updated">{t("updated")}</p>
      </article>
      <nav className="guide-more" aria-label={t("more")}>
        <p className="receipt-caption">{t("more")}</p>
        <ul>{others.map((s) => <li key={s}><Link href={`/guide/${s}`}>{t(`${GUIDES[s]}.nav`)}</Link></li>)}</ul>
      </nav>
    </main>
  );
}
