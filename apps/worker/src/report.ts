import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import postgres from "postgres";
import { connectionOptions, ownerReport } from "@baga/db";
import { renderOwnerReport, type Commit } from "./report-render";
import { sendTelegram } from "./telegram";

/**
 * The daily owner report (DECISIONS.md, 2026-11-11 "Daily owner report"), run by .github/workflows/report.yml after
 * the collector's window. Reads the database as the read-only user baga_reporter (REPORT_DATABASE_URL, migration
 * 0024), inside a read-only transaction either way, and sends one Telegram message to OWNER_TELEGRAM_CHAT_ID.
 * `--dry` prints it instead.
 */
const dry = process.argv.includes("--dry");
const url = process.env.REPORT_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!url) throw new Error("REPORT_DATABASE_URL (or DATABASE_URL) is not set");
const sql = postgres(url, { max: 1, idle_timeout: 5, ...connectionOptions(url) });

function commits(): Commit[] {
  try {
    const out = execFileSync("git", ["log", "--since=24 hours ago", "--no-merges", "--pretty=format:%h%x09%s"], { encoding: "utf8" });
    return out.split("\n").filter(Boolean).map((l) => {
      const [hash = "", ...rest] = l.split("\t");
      return { hash, subject: rest.join("\t") };
    });
  } catch {
    return [];
  }
}

try {
  const report = await sql.begin("read only", (tx) => ownerReport(tx as unknown as postgres.Sql));
  let html = renderOwnerReport(report, commits());
  if (!process.env.REPORT_DATABASE_URL) html += "\n\n<i>Read with the main database user: set REPORT_DATABASE_URL.</i>";
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, `${html.replace(/<[^>]+>/g, "")}\n`);
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chat = process.env.OWNER_TELEGRAM_CHAT_ID?.trim();
  if (dry || !token || !chat) {
    console.log(html);
    if (!dry) console.log("\n(not sent: TELEGRAM_BOT_TOKEN or OWNER_TELEGRAM_CHAT_ID is missing)");
  } else {
    const site = (process.env.SITE_URL?.trim() || "https://bagaapp.com").replace(/\/+$/, "");
    await sendTelegram(token, chat, { html, buttons: [{ text: "Admin", url: `${site}/ru/admin` }] });
    console.log("report sent");
  }
} finally {
  await sql.end({ timeout: 5 });
}
