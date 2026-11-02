import { formatTenge } from "@baga/core";

/** Telegram alert texts (like email.ts, the worker's copy lives next to its sender). Sent as Telegram HTML. */
type Locale = "ru" | "kk";
const copy = {
  ru: {
    first: "Цена получена",
    target: "Цена дошла до вашей!",
    now: "Сейчас на Kaspi",
    yours: "Ваша цена",
    sellers: (n: number) => `продавцов: ${n}`,
    waitNote: "Напишем, когда цена опустится до вашей.",
    hitNote: "Цена уже не выше вашей.",
    open: "Открыть в BAGA",
    buy: "Открыть на Kaspi",
    footer: "/list — мои товары · /stop — отключить",
    noOffers: "сейчас нет в продаже",
  },
  kk: {
    first: "Баға алынды",
    target: "Баға сіздің бағаңызға жетті!",
    now: "Қазір Kaspi-де",
    yours: "Сіздің бағаңыз",
    sellers: (n: number) => `сатушылар: ${n}`,
    waitNote: "Баға сіздің бағаңызға дейін түскенде жазамыз.",
    hitNote: "Баға сіздің бағаңыздан жоғары емес.",
    open: "BAGA-да ашу",
    buy: "Kaspi-де ашу",
    footer: "/list — менің тауарларым · /stop — өшіру",
    noOffers: "қазір сатылымда жоқ",
  },
} as const;

const esc = (s: string) => s.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!);

/** An alert as Telegram HTML plus link buttons (Kaspi first: that is where the visitor buys). */
export function renderTelegramAlert(p: {
  type: "first_price" | "target_reached"; locale: Locale; title: string; price: number | null; target: number;
  offerCount: number; productUrl: string; kaspiUrl: string;
}): { html: string; buttons: { text: string; url: string }[] } {
  const c = copy[p.locale];
  const f = (n: number) => formatTenge(n, p.locale);
  const hit = p.price !== null && p.price <= p.target;
  const now = p.price !== null
    ? `<b>${f(p.price)}</b>${p.offerCount ? ` · ${c.sellers(p.offerCount)}` : ""}`
    : c.noOffers;
  const note = p.type === "target_reached" ? "" : hit ? `✅ ${c.hitNote}` : `⏳ ${c.waitNote}`;
  const html = [
    p.type === "first_price" ? `🧾 <b>${c.first}</b>` : `🎯 <b>${c.target}</b>`,
    "",
    `<b>${esc(p.title)}</b>`,
    "",
    `💰 ${c.now}: ${now}`,
    `🎯 ${c.yours}: ${f(p.target)}`,
    ...(note ? ["", note] : []),
    "",
    `<i>${c.footer}</i>`,
  ].join("\n");
  return { html, buttons: [{ text: c.buy, url: p.kaspiUrl }, { text: c.open, url: p.productUrl }] };
}

/** Telegram Bot API (not Kaspi). Throws on failure so the notification is marked failed. */
export async function sendTelegram(token: string, chatId: string, msg: { html: string; buttons: { text: string; url: string }[] }): Promise<number> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId, text: msg.html, parse_mode: "HTML", link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: msg.buttons.map((b) => [b]) },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number }; description?: string };
  if (!res.ok || !body.ok) throw new Error(`telegram ${res.status}: ${body.description ?? ""}`.slice(0, 300));
  return body.result?.message_id ?? 0;
}
