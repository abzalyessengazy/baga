import { formatTenge } from "@baga/core";

/** Telegram alert texts (like email.ts, the worker's copy lives next to its sender). Plain text, no markup. */
type Locale = "ru" | "kk";
const copy = {
  ru: {
    first: "BAGA: цена получена",
    target: "BAGA: цена дошла до вашей",
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
    first: "BAGA: баға алынды",
    target: "BAGA: баға сіздің бағаңызға жетті",
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

export function renderTelegramAlert(p: {
  type: "first_price" | "target_reached"; locale: Locale; title: string; price: number | null; target: number;
  offerCount: number; productUrl: string; kaspiUrl: string;
}): string {
  const c = copy[p.locale];
  const f = (n: number) => formatTenge(n, p.locale);
  const now = p.price !== null ? `${f(p.price)}${p.offerCount ? ` (${c.sellers(p.offerCount)})` : ""}` : c.noOffers;
  const note = p.type === "target_reached" ? "" : p.price !== null && p.price <= p.target ? c.hitNote : c.waitNote;
  return [
    p.type === "first_price" ? c.first : c.target,
    "",
    p.title,
    `${c.now}: ${now}`,
    `${c.yours}: ${f(p.target)}`,
    ...(note ? ["", note] : []),
    "",
    `${c.open}: ${p.productUrl}`,
    `${c.buy}: ${p.kaspiUrl}`,
    "",
    c.footer,
  ].join("\n");
}

/** Telegram Bot API (not Kaspi). Throws on failure so the notification is marked failed. */
export async function sendTelegram(token: string, chatId: string, text: string): Promise<number> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number }; description?: string };
  if (!res.ok || !body.ok) throw new Error(`telegram ${res.status}: ${body.description ?? ""}`.slice(0, 300));
  return body.result?.message_id ?? 0;
}
