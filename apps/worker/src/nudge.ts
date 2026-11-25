import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { claimDigest, connectionOptions, digestDue, suggestFor, accessCodeFor } from "@baga/db";
import { almatyDay, DIGEST } from "@baga/core";
import { env } from "./env";
import { sendViaResend } from "./email";
import { renderEmailDigest, renderTelegramDigest } from "./nudge-render";
import { chatGone, sendTelegram, sendTelegramPhotos } from "./telegram";

/**
 * The 3-day note to people who track something (DECISIONS.md, 2026-11-13 "Profiles, leaderboard and the 3-day note";
 * the owner: «send email or telegram alerts every 3 days»). Run once a day after the collector
 * (.github/workflows/nudge.yml): everyone whose last note is DIGEST.dueHours old gets one, in Telegram when it is
 * linked, else by confirmed email. A note is claimed in the database before it is sent, so a second run or a crash
 * can never send it twice. No Kaspi request. `--dry` prints the notes and sends nothing.
 */
const dry = process.argv.includes("--dry");
/** `--team-test`: a sample note to the team's own profiles only (by email when it is confirmed), not recorded as
 * their note and with «[Тест]» in the subject. For the owner to see what people get. */
const teamTest = process.argv.includes("--team-test");
const url = process.env.DATABASE_URL?.trim();
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { max: 1, idle_timeout: 5, ...connectionOptions(url) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let due;
  try {
    due = await digestDue(sql, 200, { team: teamTest });
  } catch (e) {
    // Before migration 0027 there is nothing to send: not a failed run.
    if ((e as { code?: string }).code === "42703") { console.log("[nudge] profile columns are missing (migration 0027 not applied): nothing sent"); return; }
    throw e;
  }
  const site = env.siteUrl(), token = env.telegramBotToken(), key = env.resendApiKey();
  let sent = 0, failed = 0, skipped = 0, left = 0;
  for (const d of due) {
    const suggestions = await suggestFor(sql, d.watcherId, DIGEST.suggestions).catch(() => []);
    // Sign-in links (migration 0032): set the person's code the first time; a dry run writes nothing.
    const accessCode = dry ? null : await accessCodeFor(sql, d.watcherId, randomBytes(18).toString("base64url")).catch(() => null);
    const note = { locale: d.locale, nickname: d.nickname, items: d.items, suggestions, site, accessCode };
    const byEmail = d.email && d.stopCode && key ? "email" : null, byTelegram = d.chatId && token ? "telegram" : null;
    const channel = teamTest ? byEmail ?? byTelegram : byTelegram ?? byEmail;
    if (dry) {
      console.log(`\n--- ${channel ?? "no channel configured"} · ${d.locale} · ${d.items.length} product(s) ---`);
      // GitHub logs of this public repo are public: there, only the line above (security audit, 20 Nov 2026).
      if (!process.env.GITHUB_ACTIONS) console.log(d.chatId ? renderTelegramDigest(note).html : renderEmailDigest({ ...note, stopUrl: `${site}/${d.locale}/email?digest=…` }).text);
      continue;
    }
    if (!channel) { skipped++; continue; }
    if (!teamTest && !(await claimDigest(sql, d.watcherId))) { skipped++; continue; }
    try {
      if (channel === "telegram") {
        const msg = renderTelegramDigest(note);
        // The photos are a nicety: if Telegram cannot fetch them, the note still goes.
        await sendTelegramPhotos(token!, d.chatId!, msg.photos).catch((e) => console.error(`[nudge] photos skipped: ${e}`));
        await sendTelegram(token!, d.chatId!, msg);
      } else {
        const msg = renderEmailDigest({ ...note, stopUrl: `${site}/${d.locale}/email?digest=${d.stopCode}` });
        if (teamTest) msg.subject = `[Тест] ${msg.subject}`;
        await sendViaResend(key!, env.emailFrom(), d.email!, msg, `${site}/api/digest-stop?c=${d.stopCode}`, `digest:${d.watcherId}:${almatyDay(new Date())}${teamTest ? `:test:${Date.now()}` : ""}`);
      }
      sent++;
    } catch (e) {
      // A chat that blocked the bot is unlinked: the next note goes by email, if confirmed (audit 20 Nov 2026). The
      // person's choice, not a failed send: it does not turn the run red (the owner, 25 Nov 2026: two red runs, each
      // one person who had blocked the bot).
      if (channel === "telegram" && chatGone(e)) {
        left++;
        console.log(`[nudge] telegram chat gone (${e instanceof Error ? e.message : e}): unlinked`);
        await sql`update watchers set telegram_chat_id = null where telegram_chat_id = ${d.chatId!}`.catch(() => undefined);
      } else {
        failed++;
        console.error(`[nudge] ${channel} failed: ${e}`);
      }
    }
    await sleep(150);
  }
  console.log(`[nudge] due ${due.length}, sent ${sent}, failed ${failed}, left ${left}, skipped ${skipped}${dry ? " (dry run: nothing sent)" : ""}`);
  if (failed) process.exitCode = 1; // a red run makes GitHub tell the owner (cost audit 20 Nov 2026)
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => sql.end());
