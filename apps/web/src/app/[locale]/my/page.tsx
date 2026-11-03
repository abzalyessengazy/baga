import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSql, listWatched } from "@baga/db";
import { slugName } from "@baga/core";
import { currentWatcher, telegramConnectUrl, botUsername, emailReady } from "@/lib/watcher";
import { siteUrl } from "@/lib/site";
import { MyList } from "@/components/MyList";
import { EmailConnect } from "@/components/EmailConnect";

type Props = { params: Promise<{ locale: string }> };
// Per visitor (cookie): never prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "my" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** "Мои товары": what this browser tracks, before registration exists (DECISIONS.md, 2026-11-02). */
export default async function MyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("my");
  const found = await currentWatcher();
  const sql = getSql();
  const items = found && sql ? await listWatched(sql, found.watcher.id) : [];
  const tgUrl = found ? await telegramConnectUrl(found.watcher) : null;
  const shareUrl = found ? `${siteUrl()}/api/my?k=${found.secret}&l=${locale}` : null;
  return (
    <main className="wrap untracked">
      <h1 className="product-title" style={{ color: "var(--ink-on-counter, var(--ink))" }}>{t("title")}</h1>
      <article className="receipt">
        {found && items.length > 0 && !found.watcher.telegramChatId && !found.watcher.emailConfirmed && (
          <div className="channel-needed my-alert" role="alert">
            <p className="channel-title">{t("noChannelTitle")}</p>
            <p className="channel-text" style={{ margin: 0 }}>{t("noChannelText")}</p>
          </div>
        )}
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
            <hr className="rule" />
            <p className="note">{t("shareNote")}</p>
            <p className="my-share">{shareUrl}</p>
          </>
        )}
      </article>
    </main>
  );
}
