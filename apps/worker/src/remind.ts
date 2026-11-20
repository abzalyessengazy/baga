import postgres from "postgres";
import { BF_TOPIC, blackFridayRows, claimReminder, connectionOptions, dueReminders } from "@baga/db";
import { almatyDay, salePhase } from "@baga/core";
import { env } from "./env";
import { renderBfReminder } from "./remind-render";
import { sendTelegram } from "./telegram";

/**
 * The Black Friday reminder (DECISIONS.md, 2026-11-15; .github/workflows/remind.yml): on the first sale day, after the
 * store runs, one Telegram message to each chat that asked for it. Each is claimed before it is sent, so a backup run
 * never sends twice. Reads our own database only: no store or Kaspi request. `--dry` prints the message, sends nothing.
 */
const dry = process.argv.includes("--dry");
const url = process.env.DATABASE_URL?.trim();
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { max: 1, idle_timeout: 5, ...connectionOptions(url) });

async function main() {
  const today = almatyDay(new Date());
  if (!dry && salePhase(today) !== "during") { console.log(`[remind] ${today} is not a sale day: nothing sent`); return; }
  const rows = await blackFridayRows(sql, today);
  const due = await dueReminders(sql, BF_TOPIC);
  const site = env.siteUrl(), token = env.telegramBotToken();
  if (dry) {
    console.log(renderBfReminder(rows, "ru", site).html);
    console.log(`[remind] ${due.length} waiting (dry run: nothing sent)`);
    return;
  }
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  let sent = 0, failed = 0;
  for (const d of due) {
    if (!(await claimReminder(sql, d.id))) continue;
    try { await sendTelegram(token, d.chatId, renderBfReminder(rows, d.locale, site)); sent++; }
    catch (e) { failed++; console.error(`[remind] failed: ${e}`); }
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`[remind] due ${due.length}, sent ${sent}, failed ${failed}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => sql.end());
