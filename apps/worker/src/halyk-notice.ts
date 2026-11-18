/**
 * One-off «дешевле на Halyk Market» notice (the owner approved the text on 17 Nov and the list of 5 on 18 Nov 2026).
 * For each active tracking whose person can be reached (Telegram or a confirmed email; team browsers left out) and
 * whose product has a confirmed Halyk Market match priced today, in stock, cheaper than Kaspi's current lowest price
 * by ≥ 5 000 ₸ and ≥ 1%: one message per person per product. Observed prices only; no bonuses or instalments.
 *
 *   pnpm --filter @baga/worker halyk-notice            dry run: prints the list and the messages, sends nothing
 *   pnpm --filter @baga/worker halyk-notice --send --only telegram|email
 *
 * `--max N` refuses to send when the list grew beyond what the owner approved (default 5). HALYK_NOTICE_LOG (a file)
 * records Telegram sends, so a second run never sends the same person the same product twice; the email carries a
 * Resend idempotency key.
 */
import postgres from "postgres";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { formatTenge } from "@baga/core";
import { connectionOptions } from "@baga/db";
import { env } from "./env";
import { sendTelegram } from "./telegram";
import { sendViaResend } from "./email";

const TOPIC = "halyk_2026_11_18";
const send = process.argv.includes("--send");
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const max = process.argv.includes("--max") ? Number(process.argv[process.argv.indexOf("--max") + 1]) : 5;

const copy = {
  ru: {
    head: (t: string) => `📉 ${t} — дешевле на Halyk Market`,
    halyk: (p: string, n: number | null) => `Halyk Market: <b>${p}</b>${n === 1 ? " (1 продавец)" : n ? ` (${n} ${n % 10 === 1 && n % 100 !== 11 ? "продавец" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "продавца" : "продавцов"}, цена самого дешёвого)` : ""}`,
    kaspi: (p: string) => `Kaspi: ${p}`,
    diff: (d: string, at: string) => `Разница: <b>${d}</b> · проверено сегодня, ${at}`,
    note: "Это цена на сайте Halyk Market, такой же товар; бонусы и условия рассрочки не учтены. Вашу цену на Kaspi мы продолжаем отслеживать.",
    open: "Открыть в BAĞA", halykBtn: "Открыть на Halyk Market",
  },
  kk: {
    head: (t: string) => `📉 ${t} — Halyk Market-те арзанырақ`,
    halyk: (p: string, n: number | null) => `Halyk Market: <b>${p}</b>${n === 1 ? " (1 сатушы)" : n ? ` (${n} сатушы, ең арзанының бағасы)` : ""}`,
    kaspi: (p: string) => `Kaspi: ${p}`,
    diff: (d: string, at: string) => `Айырмасы: <b>${d}</b> · бүгін тексерілді, ${at}`,
    note: "Бұл Halyk Market сайтындағы баға, дәл сол тауар; бонустар мен бөліп төлеу шарттары есепке алынбаған. Kaspi-дегі бағаңызды бақылауды жалғастырамыз.",
    open: "BAĞA-да ашу", halykBtn: "Halyk Market-те ашу",
  },
};
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

const sql = postgres(env.databaseUrl(), { max: 1, ...connectionOptions(env.databaseUrl()) });

async function main() {
  const rows = await sql<{ watcherId: string; externalId: string; title: string; titleKk: string | null; locale: "ru" | "kk"; chatId: string | null; email: string | null;
    stopCode: string | null; kaspi: number; halyk: number; offers: number | null; at: Date; halykUrl: string }[]>`
    with hp as (select distinct on (m.id) m.id, m.product_id, sp.price, sp.offers, sp.in_stock, sp.observed_at, k.base_url || k.product_path || m.store_slug as url
      from store_matches m join marketplaces k on k.id = m.marketplace_id and k.code = 'halyk' join store_prices sp on sp.match_id = m.id
      where m.status = 'confirmed' order by m.id, sp.observed_at desc)
    select w.id as "watcherId", p.external_id as "externalId", p.title, p.title_kk as "titleKk", w.locale, w.telegram_chat_id::text as "chatId",
      case when w.email_confirmed_at is not null then w.email end as email, w.email_stop_code as "stopCode",
      s.current_min_price as kaspi, hp.price as halyk, hp.offers, hp.observed_at as at, hp.url as "halykUrl"
    from trackings t join watchers w on w.id = t.watcher_id join products p on p.id = t.product_id
    join product_state s on s.product_id = p.id join hp on hp.product_id = p.id
    where t.status = 'active' and not w.internal and (w.telegram_chat_id is not null or w.email_confirmed_at is not null)
      and hp.in_stock and (hp.observed_at at time zone 'Asia/Almaty')::date = (now() at time zone 'Asia/Almaty')::date
      and s.in_stock and s.current_min_price - hp.price >= 5000 and (s.current_min_price - hp.price) * 100 >= s.current_min_price
    order by s.current_min_price - hp.price desc`;
  // One message per person per product (a person tracking it twice in two cities gets one).
  const seen = new Set<string>();
  const list = rows.filter((r) => !seen.has(`${r.watcherId}:${r.externalId}`) && seen.add(`${r.watcherId}:${r.externalId}`));
  console.log(`${list.length} message(s): ${list.filter((r) => r.chatId).length} Telegram, ${list.filter((r) => !r.chatId && r.email).length} email`);
  if (send && list.length > max) throw new Error(`the list has ${list.length} messages, more than the ${max} approved: nothing sent`);

  const site = env.siteUrl(), token = env.telegramBotToken(), key = env.resendApiKey();
  const log = process.env.HALYK_NOTICE_LOG;
  const sent = new Set(log && existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : []);
  for (const r of list) {
    const c = copy[r.locale];
    const f = (n: number) => formatTenge(n, r.locale);
    const title = esc((r.locale === "kk" && r.titleKk) || r.title);
    const at = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Almaty" }).format(r.at);
    const lines = [`<b>${c.head(title)}</b>`, "", c.halyk(f(r.halyk), r.offers), c.kaspi(f(r.kaspi)), c.diff(f(r.kaspi - r.halyk), at), "", `<i>${c.note}</i>`];
    const page = `${site}/${r.locale}/p/${r.externalId}?utm_source=halyk_notice`;
    const channel = r.chatId ? "telegram" : "email";
    console.log(`\n--- ${channel} · ${r.title.slice(0, 50)} · −${r.kaspi - r.halyk}\n${lines.join("\n").replace(/<[^>]+>/g, "")}\n[${c.open}] ${page}\n[${c.halykBtn}] ${r.halykUrl}`);
    if (!send || (only && only !== channel)) continue;
    // Recorded before sending: a crash may lose one message, never send it twice. Telegram keeps a local log (this runs
    // once, from the owner's machine); the email's Resend idempotency key drops a repeat within 24 h.
    const id = `${r.watcherId}:${r.externalId}`;
    if (sent.has(id)) { console.log("already sent: skipped"); continue; }
    sent.add(id);
    if (process.env.HALYK_NOTICE_LOG) appendFileSync(process.env.HALYK_NOTICE_LOG, `${id}\n`);
    if (channel === "telegram") {
      if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
      await sendTelegram(token, r.chatId!, { html: lines.join("\n"), buttons: [{ text: c.open, url: page }, { text: c.halykBtn, url: r.halykUrl }] });
    } else {
      if (!key) throw new Error("RESEND_API_KEY is not set");
      const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1f">${lines.join("<br>")}<p><a href="${page}">${c.open}</a> · <a href="${r.halykUrl}">${c.halykBtn}</a></p></div>`;
      const text = `${lines.join("\n").replace(/<[^>]+>/g, "")}\n\n${c.open}: ${page}\n${c.halykBtn}: ${r.halykUrl}`;
      await sendViaResend(key, env.emailFrom(), r.email!, { subject: c.head((r.locale === "kk" && r.titleKk) || r.title), html, text },
        `${site}/api/email/stop?c=${r.stopCode}`, `${TOPIC}:${r.watcherId}:${r.externalId}`);
    }
    console.log("sent");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => sql.end());
