import "server-only";

export type TelegramButton = { text: string; url: string };

/** Escapes text for Telegram's HTML parse mode (only <, > and & are special). */
export const tgEscape = (s: string) => s.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!);

/**
 * Telegram Bot API (not Kaspi). Text is HTML (parse_mode), so everything not written by us must go through
 * tgEscape. Optional link buttons go under the message, one row each.
 */
export async function sendTelegram(chatId: string | number, html: string, buttons: TelegramButton[] = []): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true },
      ...(buttons.length ? { reply_markup: { inline_keyboard: buttons.map((b) => [b]) } } : {}),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) console.error(`[telegram] sendMessage ${res.status}`);
}

/** Any other Bot API method (answerCallbackQuery, editMessageText). Failures are logged, never thrown. */
export async function telegramCall(method: string, body: Record<string, unknown>): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res?.ok) console.error(`[telegram] ${method} ${res?.status ?? "network"}`);
}
