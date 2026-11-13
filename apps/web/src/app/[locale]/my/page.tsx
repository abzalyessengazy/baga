import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSql, listWatched, productSellers, getProfile, getProfileStats, suggestFor } from "@baga/db";
import { levelFor, slugName } from "@baga/core";
import { currentWatcher, telegramConnectUrl, botUsername, emailReady } from "@/lib/watcher";
import { siteUrl } from "@/lib/site";
import { MyList } from "@/components/MyList";
import { EmailConnect } from "@/components/EmailConnect";
import { ConsentNote } from "@/components/ConsentNote";
import { ForgetMe } from "@/components/ForgetMe";
import { BoughtPrompt } from "@/components/BoughtPrompt";
import { ProfileCard } from "@/components/ProfileCard";
import { Suggestions } from "@/components/Suggestions";

type Props = { params: Promise<{ locale: string }> };
// Per visitor (cookie): never prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "my" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * "Мои товары": what this browser tracks, before registration exists (DECISIONS.md, 2026-11-02). Since 13 Nov it opens
 * with the visitor's profile (nickname, avatar, sums, place on the board) and ends with products worth tracking too.
 */
export default async function MyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("my");
  const found = await currentWatcher();
  const sql = getSql();
  const items = found && sql ? await listWatched(sql, found.watcher.id) : [];
  // The current sellers of each product asked "Вы купили?", for "Как прошла покупка?" after "yes" (one by one: pool).
  const sellersOf = new Map<string, { sellerId: string; name: string }[]>();
  for (const i of items.filter((x) => x.askBought && x.externalId)) {
    if (sql) sellersOf.set(i.externalId!, await productSellers(sql, i.externalId!).catch(() => []));
  }
  const tgUrl = found ? await telegramConnectUrl(found.watcher) : null;
  const shareUrl = found ? `${siteUrl()}/api/my?k=${found.secret}&l=${locale}` : null;
  // The profile needs migration 0027: until it is applied the page stays the plain list.
  const prof = found && sql ? await (async () => {
    const profile = await getProfile(sql, found.watcher.id);
    if (!profile) return null;
    const stats = await getProfileStats(sql, found.watcher.id);
    const suggestions = await suggestFor(sql, found.watcher.id, 6);
    return { profile, stats, suggestions };
  })().catch((e) => { console.error(`[my] profile ${e}`); return null; }) : null;
  return (
    <main className="wrap untracked">
      {prof && (
        <ProfileCard
          profile={{ ...prof.profile, profileAt: prof.profile.profileAt?.toISOString() ?? null, since: prof.profile.since.toISOString() }}
          stats={prof.stats} level={levelFor(prof.stats.tracked)}
          hasChannel={!!found?.watcher.telegramChatId || !!found?.watcher.emailConfirmed} />
      )}
      <h1 className="product-title" style={{ color: "var(--ink-on-counter, var(--ink))" }}>{t("title")}</h1>
      <article className="receipt">
        {found && items.length > 0 && !found.watcher.telegramChatId && !found.watcher.emailConfirmed && (
          <div className="channel-needed my-alert" role="alert">
            <p className="channel-title">{t("noChannelTitle")}</p>
            <p className="channel-text" style={{ margin: 0 }}>{t("noChannelText")}</p>
          </div>
        )}
        {items.filter((i) => i.askBought).map((i) => (
          <BoughtPrompt key={i.trackingId} by={{ trackingId: i.trackingId }} href={i.pagePath} sellers={i.externalId ? sellersOf.get(i.externalId) : []}
            title={i.title ?? (i.slug ? slugName(i.slug) : i.externalId ? `№ ${i.externalId}` : t("shortLinkItem"))} />
        ))}
        {items.length === 0 ? (
          <p className="untracked-status">{t("empty")}</p>
        ) : (
          <MyList
            locale={locale as "ru" | "kk"}
            items={items.map((i) => ({
              trackingId: i.trackingId, href: i.pagePath, imageUrl: i.imageUrl, targetPrice: i.targetPrice, targetDropPct: i.targetDropPct,
              currentMinPrice: i.currentMinPrice,
              name: i.title ?? (i.slug ? slugName(i.slug) : i.externalId ? `№ ${i.externalId}` : t("shortLinkItem")),
            }))}
          />
        )}
        {found && (
          <>
            <hr className="rule" />
            {found.watcher.telegramChatId ? (
              <p className="note">{t("telegramLinked")}</p>
            ) : tgUrl ? (
              <>
                <a className="btn btn-stamp" href={tgUrl} target="_blank" rel="noopener">{t("telegramConnect")}</a>
                <p className="note">{t("telegramHint")}</p>
              </>
            ) : !botUsername() ? <p className="note">{t("telegramSoon")}</p> : null}
            {emailReady() && (
              <>
                <hr className="rule" />
                <EmailConnect initial={{ address: found.watcher.email, confirmed: found.watcher.emailConfirmed }} removable />
              </>
            )}
            {!found.watcher.telegramChatId && !found.watcher.emailConfirmed && (tgUrl || emailReady()) && <ConsentNote />}
            <hr className="rule" />
            <p className="note">{t("shareNote")}</p>
            <p className="my-share">{shareUrl}</p>
            <hr className="rule" />
            <ForgetMe />
          </>
        )}
      </article>
      {prof && <Suggestions items={prof.suggestions} />}
    </main>
  );
}
