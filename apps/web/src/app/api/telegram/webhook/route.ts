import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getSql, linkTelegram, getWatcherByChat, unlinkTelegram, listWatched, type Watcher } from "@baga/db";
import { formatTenge, slugName } from "@baga/core";
import { sendTelegram } from "@/lib/telegram";
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
    await sendTelegram(chat, w ? `${t("linked")}\n\n${await listText(w)}` : t("badCode"));
  } else if (cmd === "/list" || cmd === "/start") {
    const w = await getWatcherByChat(sql, chat);
    const t = await getTranslations({ locale: w?.locale ?? guess, namespace: "bot" });
    await sendTelegram(chat, w ? await listText(w) : t("welcome", { site: siteUrl() }));
  } else if (cmd === "/stop") {
    const w = await getWatcherByChat(sql, chat);
    const t = await getTranslations({ locale: w?.locale ?? guess, namespace: "bot" });
    await unlinkTelegram(sql, chat);
    await sendTelegram(chat, t("stopped"));
  } else {
    const w = await getWatcherByChat(sql, chat);
    const t = await getTranslations({ locale: w?.locale ?? guess, namespace: "bot" });
    await sendTelegram(chat, t("help"));
  }
  return NextResponse.json({ ok: true });
}

async function listText(w: Watcher): Promise<string> {
  const sql = getSql()!;
  const t = await getTranslations({ locale: w.locale, namespace: "bot" });
  const items = await listWatched(sql, w.id);
  if (!items.length) return t("empty", { site: `${siteUrl()}/${w.locale}` });
  const f = (n: number) => formatTenge(n, w.locale);
  const lines = items.map((i) => {
    const name = i.title ?? (i.slug ? slugName(i.slug) : i.externalId ? `№ ${i.externalId}` : t("shortLinkItem"));
    const now = i.currentMinPrice !== null ? f(i.currentMinPrice) : t("noPriceYet");
    return `• ${name}\n  ${t("line", { now, target: f(i.targetPrice) })}\n  ${siteUrl()}/${w.locale}${i.pagePath}`;
  });
  return `${t("listTitle", { count: items.length })}\n\n${lines.join("\n\n")}`;
}
