import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getSql, linkTelegram, getWatcherByChat, unlinkTelegram, listWatched, answerBought, type BoughtAnswer, type Watcher } from "@baga/db";
import { formatTenge, slugName } from "@baga/core";
import { sendTelegram, telegramCall, tgEscape } from "@/lib/telegram";
import { siteUrl } from "@/lib/site";

/**
 * Telegram bot webhook (DECISIONS.md, 2026-11-02). Telegram sends the secret header we registered with setWebhook;
 * anything else is refused. Commands: /start <code> links alerts, /list shows what is tracked, /stop unlinks.
 * Alerts themselves are sent by the collector. Button taps on its "Вы купили?" message arrive as callback_query
 * `b:<bought_code>:<answer>` (migration 0011).
 */
type Update = {
  message?: { chat?: { id?: number; type?: string }; text?: string; from?: { language_code?: string } };
  callback_query?: { id: string; data?: string; message?: { message_id?: number; chat?: { id?: number }; text?: string } };
};

async function onCallback(q: NonNullable<Update["callback_query"]>) {
  const m = /^b:([A-Za-z0-9_-]{16,64}):(yes|later|no)$/.exec(q.data ?? "");
  const sql = getSql();
  const r = m && sql ? await answerBought(sql, { code: m[1]! }, m[2] as BoughtAnswer) : null;
  if (!r) return telegramCall("answerCallbackQuery", { callback_query_id: q.id });
  const t = await getTranslations({ locale: r.locale, namespace: "bought" });
  const thanks = t(r.bought === "yes" ? "thanksYes" : r.bought === "later" ? "thanksLater" : "thanksNo");
  await telegramCall("answerCallbackQuery", { callback_query_id: q.id, text: t("saved") });
  if (q.message?.chat?.id && q.message.message_id) {
    // The question stays, its buttons go, the answer is added under it.
    await telegramCall("editMessageText", {
      chat_id: q.message.chat.id, message_id: q.message.message_id, parse_mode: "HTML",
      text: `${tgEscape(q.message.text ?? "")}\n\n<b>✓ ${tgEscape(thanks)}</b>`,
    });
  }
}

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) return new NextResponse(null, { status: 401 });
  const u = (await req.json().catch(() => ({}))) as Update;
  if (u.callback_query) { await onCallback(u.callback_query); return NextResponse.json({ ok: true }); }
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
    const hit = i.currentMinPrice !== null && i.targetPrice !== null && i.currentMinPrice <= i.targetPrice;
    const now = i.currentMinPrice !== null
      ? `💰 ${tgEscape(t("now"))} <b>${f(i.currentMinPrice)}</b>${hit ? ` ✅ ${tgEscape(t("reached"))}` : ""}`
      : `⏳ ${tgEscape(t("noPriceYet"))}`;
    return `${n + 1}. <a href="${tgEscape(url)}"><b>${tgEscape(name)}</b></a>\n${now}\n🎯 ${i.targetPrice !== null ? `${tgEscape(t("target"))} ${f(i.targetPrice)}` : tgEscape(t("targetDrop", { pct: i.targetDropPct ?? 0 }))}`;
  });
  return `🧾 <b>${tgEscape(t("listTitle", { count: items.length }))}</b>\n\n${lines.join("\n\n")}\n\n<i>${tgEscape(t("help"))}</i>`;
}
