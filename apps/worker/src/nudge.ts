import postgres from "postgres";
import { claimDigest, connectionOptions, digestDue, suggestFor } from "@baga/db";
import { almatyDay, DIGEST } from "@baga/core";
import { env } from "./env";
import { sendViaResend } from "./email";
import { renderEmailDigest, renderTelegramDigest } from "./nudge-render";
import { sendTelegram } from "./telegram";

/**
 * The 3-day note to people who track something (DECISIONS.md, 2026-11-13 "Profiles, leaderboard and the 3-day note";
 * the owner: «send email or telegram alerts every 3 days»). Run once a day after the collector
 * (.github/workflows/nudge.yml): everyone whose last note is DIGEST.dueHours old gets one, in Telegram when it is
 * linked, else by confirmed email. A note is claimed in the database before it is sent, so a second run or a crash
 * can never send it twice. No Kaspi request. `--dry` prints the notes and sends nothing.
 */
const dry = process.argv.includes("--dry");
const url = process.env.DATABASE_URL?.trim();
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { max: 1, idle_timeout: 5, ...connectionOptions(url) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let due;
  try {
    due = await digestDue(sql);
  } catch (e) {
    // Before migration 0027 there is nothing to send: not a failed run.
    if ((e as { code?: string }).code === "42703") { console.log("[nudge] profile columns are missing (migration 0027 not applied): nothing sent"); return; }
    throw e;
  }
  const site = env.siteUrl(), token = env.telegramBotToken(), key = env.resendApiKey();
  let sent = 0, failed = 0, skipped = 0;
  for (const d of due) {
    const suggestions = await suggestFor(sql, d.watcherId, DIGEST.suggestions).catch(() => []);
    const note = { locale: d.locale, nickname: d.nickname, items: d.items, suggestions, site };
    const channel = d.chatId && token ? "telegram" : d.email && d.stopCode && key ? "email" : null;
    if (dry) {
      console.log(`\n--- ${channel ?? "no channel configured"} · ${d.locale} · ${d.items.length} product(s) ---`);
      console.log(d.chatId ? renderTelegramDigest(note).html : renderEmailDigest({ ...note, stopUrl: `${site}/${d.locale}/email?digest=…` }).text);
      continue;
    }
    if (!channel) { skipped++; continue; }
    if (!(await claimDigest(sql, d.watcherId))) { skipped++; continue; }
    try {
      if (channel === "telegram") {
        await sendTelegram(token!, d.chatId!, renderTelegramDigest(note));
      } else {
        const msg = renderEmailDigest({ ...note, stopUrl: `${site}/${d.locale}/email?digest=${d.stopCode}` });
        await sendViaResend(key!, env.emailFrom(), d.email!, msg, `${site}/api/digest-stop?c=${d.stopCode}`, `digest:${d.watcherId}:${almatyDay(new Date())}`);
      }
      sent++;
    } catch (e) {
      failed++;
      console.error(`[nudge] ${channel} failed: ${e}`);
    }
    await sleep(150);
  }
  console.log(`[nudge] due ${due.length}, sent ${sent}, failed ${failed}, skipped ${skipped}${dry ? " (dry run: nothing sent)" : ""}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => sql.end());
