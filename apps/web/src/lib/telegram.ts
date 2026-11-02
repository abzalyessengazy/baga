import "server-only";

/** Telegram Bot API (not Kaspi). Text is sent as plain text, so nothing needs escaping. */
export async function sendTelegram(chatId: string | number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) console.error(`[telegram] sendMessage ${res.status}`);
}
