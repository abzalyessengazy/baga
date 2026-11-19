import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BLACK_FRIDAY, bfOrder, formatTenge, salePhase, shortTitle, type StoreSaleCheck } from "@baga/core";
import { almatyToday, blackFridayRows, getSql, type BfRow } from "@baga/db";
import { Link } from "@/i18n/navigation";
import { botUsername } from "@/lib/watcher";

type Props = { params: Promise<{ locale: string }> };
// Store and Kaspi prices arrive once a day; an hour of caching keeps the database quiet.
// Once a day (18 Nov, the owner: «why not once a day?»): the store run rebuilds it when it ends, with that day's store
// and Kaspi prices (apps/worker/src/stores.ts → /api/revalidate-products). The day here is only the fallback.
export const revalidate = 86400;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "bf" });
  return {
    title: t("metaTitle"), description: t("metaDescription"),
    alternates: { canonical: `/${locale}/black-friday`, languages: { "ru-KZ": "/ru/black-friday", "kk-KZ": "/kk/black-friday", "x-default": "/ru/black-friday" } },
  };
}

const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/**
 * «Чёрная пятница: проверяем скидки» (DECISIONS.md, 2026-11-15): products priced both on Kaspi and in Technodom or
 * Sulpak. Before the sale it shows what we wrote down; from 27 Nov, each store's sale price against its own lowest
 * price in the two weeks before (packages/core blackFriday.ts) and against Kaspi now. Observed prices only.
 */
export default async function BlackFridayPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("bf");
  const L = locale as "ru" | "kk";
  const f = (n: number) => formatTenge(n, L);
  const sql = getSql();
  const today = sql ? await almatyToday(sql).catch(() => null) : null;
  const phase = today ? salePhase(today) ?? "after" : "before";
  // Biggest real drops first, then Halyk or Technodom below Kaspi, then popularity (the database's order; the owner, 19 Nov).
  const rows: BfRow[] = bfOrder(sql && today ? await blackFridayRows(sql, today).catch(() => []) : []);

  const storeNow = (r: BfRow) => r.stores.map((s) => s.now).filter((n): n is number => n !== null);
  const kaspiCheaper = rows.filter((r) => storeNow(r).length && r.kaspiNow < Math.min(...storeNow(r))).length;
  const storeCheaper = rows.filter((r) => storeNow(r).some((n) => n < r.kaspiNow)).length;
  const checks = rows.flatMap((r) => r.stores.map((s) => s.check));
  const count = (k: StoreSaleCheck["kind"]) => checks.filter((c) => c.kind === k).length;
  const dates = { start: dm(BLACK_FRIDAY.start), end: dm(BLACK_FRIDAY.end) };
  // «Напомнить»: opens the bot with /start bf_<locale>; it keeps this chat for one message on the first sale day.
  const bot = botUsername();
  const remind = bot && phase === "before" ? `https://t.me/${bot}?start=bf_${L}` : null;

  const verdict = (c: StoreSaleCheck) => {
    switch (c.kind) {
      case "pending": return c.before ? <span className="bf-v is-wait">{t("vPending", { price: f(c.before.low), days: c.before.days })}</span> : <span className="bf-v is-wait">{t("vWatching")}</span>;
      case "real": return <span className="bf-v is-real">{t("vReal", { pct: Math.abs(c.pct!), price: f(c.before!.low) })}</span>;
      case "same": return <span className="bf-v is-same">{c.claimedPct ? t("vSameClaimed", { claimed: Math.abs(c.claimedPct), price: f(c.before!.low) }) : t("vSame", { price: f(c.before!.low) })}</span>;
      case "pricier": return <span className="bf-v is-pricier">{t("vPricier", { pct: c.pct!, price: f(c.before!.low) })}</span>;
      case "noBaseline": return <span className="bf-v is-wait">{t("vNoBaseline")}</span>;
    }
  };

  const row = (r: BfRow, i: number) => {
            const name = shortTitle((L === "kk" && r.titleKk) || r.title);
            const best = Math.min(...storeNow(r), Infinity);
            return (
              <li key={r.externalId} className="receipt bf-row">
                <div className="bf-head">
                  <span className="bf-rank">{String(i + 1).padStart(2, "0")}</span>
                  {r.imageUrl ? <img src={r.imageUrl} alt="" width={56} height={56} loading="lazy" className="bf-thumb" /> : <span className="bf-thumb" aria-hidden />}
                  <div className="bf-title">
                    <Link href={`/p/${r.externalId}`} className="bf-name">{name}</Link>
                    <p className="bf-kaspi">
                      <span className="bf-label">Kaspi</span> <b>{f(r.kaspiNow)}</b>
                      {best < Infinity && r.kaspiNow < best && <span className="bf-tag is-kaspi">{t("kaspiCheaperBy", { amount: f(best - r.kaspiNow) })}</span>}
                    </p>
                  </div>
                </div>
                <ul className="bf-stores">
                  {r.stores.map((s) => (
                    <li key={s.store}>
                      <a href={s.url} target="_blank" rel="nofollow noopener noreferrer" className="bf-store">
                        <span className={`store-chip is-${s.store}`}>{s.name}</span>
                        {s.now !== null ? <b>{f(s.now)}</b> : <span className="bf-out">{t("outOfStock")}</span>}
                        {s.now !== null && s.nowOld !== null && s.nowOld > s.now && <s className="bf-old">{f(s.nowOld)}</s>}
                        {s.now !== null && s.now < r.kaspiNow && <span className="bf-tag is-store">{t("storeCheaperBy", { amount: f(r.kaspiNow - s.now) })}</span>}
                        <span aria-hidden>↗</span>
                      </a>
                      {verdict(s.check)}
                    </li>
                  ))}
                </ul>
              </li>
            );
          };

  return (
    <main className="wrap untracked bf">
      <p className="bf-kicker">{t("kicker", dates)}</p>
      <h1 className="product-title" style={{ color: "var(--ink-on-counter, var(--ink))" }}>{t("title")}</h1>
      <p className="drops-intro">{t(phase === "before" ? "introBefore" : phase === "during" ? "introDuring" : "introAfter", dates)}</p>

      <article className="receipt bf-sum">
        <dl>
          <div><dt>{t("sumProducts")}</dt><dd>{rows.length}</dd></div>
          <div><dt>{t("sumKaspiCheaper")}</dt><dd>{kaspiCheaper}</dd></div>
          <div><dt>{t("sumStoreCheaper")}</dt><dd>{storeCheaper}</dd></div>
          {phase !== "before" && (<>
            <div><dt>{t("sumReal")}</dt><dd className="is-real">{count("real")}</dd></div>
            <div><dt>{t("sumSame")}</dt><dd>{count("same")}</dd></div>
            <div><dt>{t("sumPricier")}</dt><dd className="is-pricier">{count("pricier")}</dd></div>
          </>)}
        </dl>
        <p className="note">{t("sumNote")}</p>
      </article>

      {remind && (
        <aside className="receipt bf-remind">
          <p className="bf-remind-text"><b>{t("remindTitle", dates)}</b><br />{t("remindText")}</p>
          <a className="btn btn-stamp bf-remind-btn" href={remind} target="_blank" rel="noopener">{t("remindButton")}</a>
        </aside>
      )}

      {rows.length === 0 ? <article className="receipt"><p className="untracked-status">{t("none")}</p></article> : (
        <>
          <ol className="bf-list">{rows.slice(0, BLACK_FRIDAY.shown).map((r, i) => row(r, i))}</ol>
          {/* The rest of the pairs, one tap away (18 Nov): plain HTML, no script, and the first screen stays light. */}
          {rows.length > BLACK_FRIDAY.shown && (
            <details className="bf-more">
              <summary className="btn btn-ghost">{t("showMore", { count: rows.length - BLACK_FRIDAY.shown })}</summary>
              <ol className="bf-list" start={BLACK_FRIDAY.shown + 1}>{rows.slice(BLACK_FRIDAY.shown).map((r, i) => row(r, i + BLACK_FRIDAY.shown))}</ol>
            </details>
          )}
        </>
      )}
      <p className="note bf-foot">{t("foot")}</p>
    </main>
  );
}
