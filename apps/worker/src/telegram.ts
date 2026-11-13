import { formatTenge, isPermanentHttpStatus } from "@baga/core";

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
    open: "Открыть в BAĞA",
    buy: "Открыть на Kaspi",
    footer: "/list — мои товары · /stop — отключить",
    noOffers: "сейчас нет в продаже",
    askTitle: "Вы купили?",
    askText: "Недавно цена дошла до вашей. Ответьте одной кнопкой — так мы поймём, помогает ли BAĞA.",
    askYes: "Да, купил(а)",
    askLater: "Пока нет",
    askNo: "Нет, передумал(а)",
  },
  kk: {
    first: "Баға алынды",
    target: "Баға сіздің бағаңызға жетті!",
    now: "Қазір Kaspi-де",
    yours: "Сіздің бағаңыз",
    sellers: (n: number) => `сатушылар: ${n}`,
    waitNote: "Баға сіздің бағаңызға дейін түскенде жазамыз.",
    hitNote: "Баға сіздің бағаңыздан жоғары емес.",
    open: "BAĞA-да ашу",
    buy: "Kaspi-де ашу",
    footer: "/list — менің тауарларым · /stop — өшіру",
    noOffers: "қазір сатылымда жоқ",
    askTitle: "Сатып алдыңыз ба?",
    askText: "Жақында баға сіздің бағаңызға жетті. Бір батырмамен жауап беріңіз — BAĞA көмектесе ме, соны түсінеміз.",
    askYes: "Иә, сатып алдым",
    askLater: "Әзірге жоқ",
    askNo: "Жоқ, ойымнан қайттым",
  },
} as const;

/** A link button, or a button whose tap comes back to the bot's webhook (callback_query). */
export type TelegramButton = { text: string; url: string } | { text: string; callback_data: string };

const esc = (s: string) => s.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!);

/** An alert as Telegram HTML plus link buttons (Kaspi first: that is where the visitor buys). */
export function renderTelegramAlert(p: {
  type: "first_price" | "target_reached"; locale: Locale; title: string; price: number | null;
  /** Null only for a percentage target on a product that had no offers at its first check (migration 0010). */
  target: number | null;
  offerCount: number; productUrl: string; kaspiUrl: string;
}): { html: string; buttons: TelegramButton[] } {
  const c = copy[p.locale];
  const f = (n: number) => formatTenge(n, p.locale);
  const hit = p.price !== null && p.target !== null && p.price <= p.target;
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
    ...(p.target !== null ? [`🎯 ${c.yours}: ${f(p.target)}`] : []),
    ...(note ? ["", note] : []),
    "",
    `<i>${c.footer}</i>`,
  ].join("\n");
  return { html, buttons: [{ text: c.buy, url: p.kaspiUrl }, { text: c.open, url: p.productUrl }] };
}

/**
 * "Вы купили?" a day after a target alert (migration 0011): three buttons answered in the website's webhook as
 * `b:<bought_code>:<answer>`.
 */
export function renderTelegramBoughtAsk(p: { locale: Locale; title: string; code: string }): { html: string; buttons: TelegramButton[] } {
  const c = copy[p.locale];
  const html = [`🛍 <b>${c.askTitle}</b>`, "", `<b>${esc(p.title)}</b>`, "", c.askText].join("\n");
  const b = (text: string, a: string) => ({ text, callback_data: `b:${p.code}:${a}` });
  return { html, buttons: [b(c.askYes, "yes"), b(c.askLater, "later"), b(c.askNo, "no")] };
}

/** Telegram Bot API (not Kaspi). Throws on failure so the notification is marked failed. */
/** A failed send; `permanent` = retrying cannot help (blocked bot, unknown chat, bad request). */
export class DeliveryError extends Error {
  constructor(message: string, readonly permanent: boolean) {
    super(message);
    this.name = "DeliveryError";
  }
}

/** `previewUrl` shows that link's preview card under the message (the 3-day note); without it no preview is shown. */
export async function sendTelegram(token: string, chatId: string, msg: { html: string; buttons: TelegramButton[]; previewUrl?: string | null }): Promise<number> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId, text: msg.html, parse_mode: "HTML",
      link_preview_options: msg.previewUrl ? { url: msg.previewUrl, prefer_small_media: true, show_above_text: false } : { is_disabled: true },
      reply_markup: { inline_keyboard: msg.buttons.map((b) => [b]) },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number }; description?: string };
  if (!res.ok || !body.ok) {
    throw new DeliveryError(`telegram ${res.status}: ${body.description ?? ""}`.slice(0, 300), isPermanentHttpStatus(res.status));
  }
  return body.result?.message_id ?? 0;
}
