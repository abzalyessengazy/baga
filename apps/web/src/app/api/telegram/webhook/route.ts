import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getSql, linkTelegram, getWatcherByChat, unlinkTelegram, listWatched, type Watcher } from "@baga/db";
import { formatTenge, slugName } from "@baga/core";
import { sendTelegram, tgEscape } from "@/lib/telegram";
import { siteUrl } from "@/lib/site";

/**
 * Telegram bot webhook (DECISIONS.md, 2026-11-02). Telegram sends the secret header we registered with setWebhook;
 * anything else is refused. Commands: /start <code> links alerts, /list shows what is tracked, /stop unlinks.
 * Alerts themselves are sent by the collector.
 */
type Update = { message?: { chat?: { id?: number; type?: string }; text?: string; from?: { language_code?: string } } };

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) return new NextResponse(null, { status: 401 });
  const u = (await req.json().catch(() => ({}))) as Update;
  const chatId = u.message?.chat?.id;
  const text = (u.message?.text ?? "").trim();
  const sql = getSql();
  // Always 200 so Telegram does not retry; private chats only.
  if (!sql || typeof chatId !== "number" || u.message?.chat?.type !== "private" || !text) return NextResponse.json({ ok: true });
  const chat = String(chatId);
  const guess = u.message?.from?.language_code === "kk" ? "kk" : "ru";

  const [cmd, arg] = text.split(/\s+/, 2);
  if (cmd === "/start" && arg && /^[A-Za-z0-9_-]{16,64}$/.test(arg)) {
    const w = await linkTelegram(sql, arg, chat);
    const t = await getTranslations({ locale: w?.locale ?? guess, namespace: "bot" });
    await sendTelegram(chat, w ? `${tgEscape(t("linked"))}\n\n${await listText(w)}` : tgEscape(t("badCode")));
  } else if (cmd === "/list" || cmd === "/start") {
    const w = await getWatcherByChat(sql, chat);
    const t = await getTranslations({ locale: w?.locale ?? guess, namespace: "bot" });
    await sendTelegram(chat, w ? await listText(w) : tgEscape(t("welcome", { site: siteUrl() })));
  } else if (cmd === "/stop") {
    const w = await getWatcherByChat(sql, chat);
    const t = await getTranslations({ locale: w?.locale ?? guess, namespace: "bot" });
    await unlinkTelegram(sql, chat);
    await sendTelegram(chat, tgEscape(t("stopped")));
  } else {
    const w = await getWatcherByChat(sql, chat);
    const t = await getTranslations({ locale: w?.locale ?? guess, namespace: "bot" });
    await sendTelegram(chat, tgEscape(t("help")));
  }
  return NextResponse.json({ ok: true });
}

/** The /list reply (Telegram HTML): a numbered receipt of what this watcher tracks, names linking to BAGA. */
async function listText(w: Watcher): Promise<string> {
  const sql = getSql()!;
  const t = await getTranslations({ locale: w.locale, namespace: "bot" });
  const items = await listWatched(sql, w.id);
  if (!items.length) return tgEscape(t("empty", { site: `${siteUrl()}/${w.locale}` }));
  const f = (n: number) => formatTenge(n, w.locale);
  const lines = items.map((i, n) => {
    const full = i.title ?? (i.slug ? slugName(i.slug) : i.externalId ? `№ ${i.externalId}` : t("shortLinkItem"));
    const name = full.length > 70 ? `${full.slice(0, 68).trimEnd()}…` : full;
    const url = `${siteUrl()}/${w.locale}${i.pagePath}`;
    const hit = i.currentMinPrice !== null && i.currentMinPrice <= i.targetPrice;
    const now = i.currentMinPrice !== null
      ? `💰 ${tgEscape(t("now"))} <b>${f(i.currentMinPrice)}</b>${hit ? ` ✅ ${tgEscape(t("reached"))}` : ""}`
      : `⏳ ${tgEscape(t("noPriceYet"))}`;
    return `${n + 1}. <a href="${tgEscape(url)}"><b>${tgEscape(name)}</b></a>\n${now}\n🎯 ${tgEscape(t("target"))} ${f(i.targetPrice)}`;
  });
  return `🧾 <b>${tgEscape(t("listTitle", { count: items.length }))}</b>\n\n${lines.join("\n\n")}\n\n<i>${tgEscape(t("help"))}</i>`;
}
