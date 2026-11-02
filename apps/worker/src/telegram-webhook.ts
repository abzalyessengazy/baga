/**
 * One-time setup: points the Telegram bot at the website's webhook, with the secret Telegram sends back on every
 * update, and sets the bot's command menu. Run after deploying, with TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET
 * and SITE_URL in .env or apps/web/.env.local (that one wins):  pnpm --filter @baga/worker telegram:webhook
 * `--info` only prints Telegram's delivery status (last error, pending updates) and changes nothing.
 */
import { env } from "./env";

const token = env.telegramBotToken();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
if (!token || !secret || !/^[A-Za-z0-9_-]{16,256}$/.test(secret)) {
  console.error("Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET (16+ letters, digits, _ or -) in .env first.");
  process.exit(1);
}
if (process.argv.includes("--info")) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const { result: r } = (await res.json()) as { result: { url?: string; pending_update_count?: number; last_error_date?: number; last_error_message?: string } };
  console.log(`webhook url:      ${r.url || "(none)"}`);
  console.log(`pending updates:  ${r.pending_update_count ?? 0}`);
  console.log(`last error:       ${r.last_error_message ? `${r.last_error_message} (${Math.round(Date.now() / 1000 - (r.last_error_date ?? 0))} s ago)` : "none"}`);
  process.exit(0);
}
const site = env.siteUrl();
if (!site.startsWith("https://")) { console.error(`SITE_URL must be the public https address, got ${site}`); process.exit(1); }

async function call(method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; description?: string };
  console.log(`${method}: ${json.ok ? "ok" : json.description}`);
  if (!json.ok) process.exitCode = 1;
}

await call("setWebhook", { url: `${site}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
for (const [language_code, list, stop] of [["", "Мои товары", "Отключить уведомления"], ["kk", "Менің тауарларым", "Хабарламаларды өшіру"]] as const) {
  await call("setMyCommands", { commands: [{ command: "list", description: list }, { command: "stop", description: stop }], ...(language_code ? { language_code } : {}) });
}
