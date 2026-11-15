import { formatTenge, isPermanentHttpStatus } from "@baga/core";

/** Telegram alert texts (like email.ts, the worker's copy lives next to its sender). Sent as Telegram HTML. */
type Locale = "ru" | "kk";
const copy = {
  ru: {
    first: "Проверили цену для вас",
    target: "Цена дошла до вашей!",
    now: "Сейчас на Kaspi",
    yours: "Ваша цена",
    gap: (d: string, pct: number) => `До вашей цены: ${d} (−${pct}%)`,
    below: (d: string) => `Ниже вашей на ${d}`,
    low30: "Самая низкая за 30 дней",
    cheapest: "Дешевле всех",
    sellers: (n: number) => `продавцов: ${n}`,
    waitNote: "Напишем, как только цена опустится до вашей.",
    hitNote: "Цена уже не выше вашей.",
    checkNote: "Цены на Kaspi меняются быстро: проверьте перед покупкой.",
    open: "📈 История цены в BAĞA",
    buy: "🛒 Открыть на Kaspi",
    my: "🧾 Мои товары",
    footer: "/list — мои товары · /stop — отключить",
    noOffers: "сейчас нет в продаже",
    askTitle: "Вы купили?",
    askText: "Недавно цена дошла до вашей. Ответьте одной кнопкой — так мы поймём, помогает ли BAĞA.",
    askYes: "Да, купил(а)",
    askLater: "Пока нет",
    askNo: "Нет, передумал(а)",
  },
  kk: {
    first: "Бағаны сіз үшін тексердік",
    target: "Баға сіздің бағаңызға жетті!",
    now: "Қазір Kaspi-де",
    yours: "Сіздің бағаңыз",
    gap: (d: string, pct: number) => `Сіздің бағаңызға дейін: ${d} (−${pct}%)`,
    below: (d: string) => `Сіздің бағаңыздан ${d} төмен`,
    low30: "30 күндегі ең төмен баға",
    cheapest: "Ең арзан сатушы",
    sellers: (n: number) => `сатушылар: ${n}`,
    waitNote: "Баға сіздің бағаңызға дейін түскен бойда жазамыз.",
    hitNote: "Баға сіздің бағаңыздан жоғары емес.",
    checkNote: "Kaspi-дегі баға тез өзгереді: сатып алар алдында тексеріңіз.",
    open: "📈 BAĞA-дағы баға тарихы",
    buy: "🛒 Kaspi-де ашу",
    my: "🧾 Менің тауарларым",
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

/**
 * An alert as a product card (16 Nov, the owner: «pretty, with icons, easy to read and come back»): Telegram HTML for
 * the caption of the product's photo, and buttons, Kaspi first (that is where the visitor buys). Observed prices only:
 * now, the person's own target, how far apart they are, and the lowest daily price of the last 30 days.
 */
export function renderTelegramAlert(p: {
  type: "first_price" | "target_reached"; locale: Locale; title: string; price: number | null;
  /** Null only for a percentage target on a product that had no offers at its first check (migration 0010). */
  target: number | null;
  offerCount: number; productUrl: string; kaspiUrl: string;
  /** Optional extras for the card: the 30-day low, the cheapest seller now, «Мои товары», the product photo. */
  low30?: number | null; seller?: string | null; myUrl?: string; imageUrl?: string | null;
}): { html: string; buttons: TelegramButton[]; photo: string | null } {
  const c = copy[p.locale];
  const f = (n: number) => formatTenge(n, p.locale);
  const hit = p.price !== null && p.target !== null && p.price <= p.target;
  const now = p.price !== null
    ? `<b>${f(p.price)}</b>${p.offerCount ? ` · ${c.sellers(p.offerCount)}` : ""}`
    : c.noOffers;
  const lines: string[] = [`💰 ${c.now}: ${now}`];
  if (p.target !== null) lines.push(`🎯 ${c.yours}: ${f(p.target)}`);
  if (p.price !== null && p.target !== null) {
    if (p.price > p.target) lines.push(`📏 ${c.gap(f(p.price - p.target), Math.max(1, Math.round(((p.price - p.target) / p.price) * 100)))}`);
    else if (p.price < p.target) lines.push(`🎉 ${c.below(f(p.target - p.price))}`);
  }
  if (p.low30 && p.price !== null && p.low30 < p.price) lines.push(`📉 ${c.low30}: ${f(p.low30)}`);
  if (p.seller && p.type === "target_reached") lines.push(`🏪 ${c.cheapest}: ${esc(p.seller)}`);
  const note = p.type === "target_reached" ? `⚡ ${c.checkNote}` : hit ? `✅ ${c.hitNote}` : `⏳ ${c.waitNote}`;
  const html = [
    p.type === "first_price" ? `🧾 <b>${c.first}</b>` : `🎯 <b>${c.target}</b>`,
    "",
    `<b>${esc(p.title)}</b>`,
    "",
    ...lines,
    "",
    note,
    "",
    `<i>${c.footer}</i>`,
  ].join("\n");
  const buttons: TelegramButton[] = [{ text: c.buy, url: p.kaspiUrl }, { text: c.open, url: p.productUrl }, ...(p.myUrl ? [{ text: c.my, url: p.myUrl }] : [])];
  return { html, buttons, photo: p.imageUrl ?? null };
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
/**
 * Product photos ahead of a note: one photo, or an album of 2–10 (sendMediaGroup). Telegram's servers fetch the
 * picture links (Kaspi's image server), the way a reader's browser does on the site; our server requests nothing from
 * Kaspi. No buttons can ride on an album, so the note follows as its own message.
 */
export async function sendTelegramPhotos(token: string, chatId: string, urls: string[]): Promise<void> {
  if (!urls.length) return;
  const one = urls.length === 1;
  const res = await fetch(`https://api.telegram.org/bot${token}/${one ? "sendPhoto" : "sendMediaGroup"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(one
      ? { chat_id: chatId, photo: urls[0], disable_notification: true }
      : { chat_id: chatId, media: urls.slice(0, 10).map((u) => ({ type: "photo", media: u })), disable_notification: true }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!res.ok || !body.ok) throw new DeliveryError(`telegram photos ${res.status}: ${body.description ?? ""}`.slice(0, 300), isPermanentHttpStatus(res.status));
}

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

/**
 * A product card: the photo with the message as its caption and the buttons under it (sendPhoto; Telegram's servers
 * fetch the picture from Kaspi's image server, as a reader's browser does on the site). Without a photo, or when
 * Telegram cannot use it, the same message is sent as text. Returns the message id.
 */
export async function sendTelegramCard(token: string, chatId: string, msg: { html: string; buttons: TelegramButton[]; photo: string | null }): Promise<number> {
  if (msg.photo && msg.html.length <= 1000) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, photo: msg.photo, caption: msg.html, parse_mode: "HTML", reply_markup: { inline_keyboard: msg.buttons.map((b) => [b]) } }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number }; description?: string } | undefined;
    if (res?.ok && body?.ok) return body.result?.message_id ?? 0;
    // A chat that blocked the bot fails the same way as text would: say so instead of trying again.
    if (res && isPermanentHttpStatus(res.status) && !/photo|image|file|wrong.*url|webpage/i.test(body?.description ?? "")) {
      throw new DeliveryError(`telegram ${res.status}: ${body?.description ?? ""}`.slice(0, 300), true);
    }
  }
  return sendTelegram(token, chatId, msg);
}
