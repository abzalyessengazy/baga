import Anthropic from "@anthropic-ai/sdk";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { connectionOptions, getMarket } from "@baga/db";
import { CTO_MODEL, unbackedNumbers } from "./cto";
import { buildFacts, type Facts } from "./content-facts";
import { sendTelegram } from "./telegram";

/**
 * The content agent (DECISIONS.md, 2026-11-12 "Content agent"): on Monday, Wednesday and Friday it sends the owner
 * post drafts in Russian and Kazakh, written by Claude from facts chosen in code (content-facts.ts). Nothing is
 * posted: the owner copies, edits and posts. Reads the database as the read-only report user; never contacts Kaspi.
 * A draft citing a number not in the facts is withheld. `--dry` prints instead of sending.
 */
const dry = process.argv.includes("--dry");

const SYSTEM = `You write social media posts for BAĞA (bagaapp.com), a free site in Kazakhstan that shows the price history of Kaspi.kz products, the cheapest sellers, and sends a message when a price drops to the target a person set.
You get facts as JSON. Write two texts in Russian and the same two in Kazakh:
- caption: an Instagram/TikTok caption, 2–5 short lines, at most 400 characters, then 3–5 hashtags on the last line.
- story: a story/reels overlay text, at most 120 characters, ending with a call to open the link.
Rules, all of them strict:
- Use only the facts. Every number must be copied exactly from the facts (prices as in priceText/refText/gapText). Never compute, round or estimate a number, never add dates or counts that are not given.
- Describe the past only: "по нашим проверкам", "неделю назад было". Never predict prices or urge with time pressure ("успейте", "цена вырастет", "последний шанс").
- Never call a price the lowest in Kazakhstan or on Kaspi; never say BAĞA is Kaspi's partner or affiliated with Kaspi; no guarantees.
- Products keep their names as given (brand and model as-is); in Kazakh use nameKk when it is not null.
- Theme "week": the week's biggest drops, one line per product. Theme "pick": one product, cheaper than a week ago. Theme "spread": one product where sellers ask different prices: compare before buying, without recommending a seller.
- Plain, friendly, no exclamation-mark spam, at most 2 emoji per text. Natural Kazakh, not a word-for-word translation.
- Do not write links; they are added below your text.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ru", "kk"],
  properties: Object.fromEntries(["ru", "kk"].map((l) => [l, {
    type: "object", additionalProperties: false, required: ["caption", "story"],
    properties: { caption: { type: "string" }, story: { type: "string" } },
  }])),
};

type Drafts = Record<"ru" | "kk", { caption: string; story: string }>;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const THEME_NAME = { week: "the week's biggest drops", pick: "find of the day", spread: "one product, different seller prices" } as const;

export async function writeDrafts(facts: Facts, apiKey: string): Promise<{ drafts: Drafts } | { withheld: string }> {
  const input = JSON.stringify(facts);
  const client = new Anthropic({ apiKey, timeout: 180_000, maxRetries: 2 });
  try {
    const r = await client.beta.messages.create({
      model: CTO_MODEL, max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: input }],
    });
    if (r.stop_reason === "refusal") return { withheld: "the model declined" };
    const text = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const drafts = JSON.parse(text) as Drafts;
    const all = [drafts.ru.caption, drafts.ru.story, drafts.kk.caption, drafts.kk.story].join("\n");
    const bad = unbackedNumbers(all, input);
    if (bad.length) return { withheld: `the drafts cited ${bad.slice(0, 3).join(", ")}, not in the facts` };
    return { drafts };
  } catch (e) {
    if (e instanceof SyntaxError) return { withheld: "the answer was not valid JSON" };
    if (e instanceof Anthropic.AuthenticationError) return { withheld: "ANTHROPIC_API_KEY was rejected" };
    if (e instanceof Anthropic.APIError) return { withheld: `API error ${e.status ?? ""}`.trim() };
    return { withheld: "no connection to the API" };
  }
}

/** The owner's messages: what the drafts are about with the links, then one message per language to copy from. */
export function renderDrafts(facts: Facts, drafts: Drafts | null, withheld: string | null, dayLabel: string): string[] {
  const head = [`<b>Post drafts · ${dayLabel}</b> · ${THEME_NAME[facts.theme]}`];
  for (const p of facts.products) {
    const was = facts.theme === "spread" ? `sellers ${p.priceText} – ${p.refText}` : `${p.priceText}, a week ago ${p.refText} (−${p.pct}%)`;
    head.push("", `<b>${esc(p.name)}</b>: ${was} · ${p.sellers} seller${p.sellers === 1 ? "" : "s"}`, `ru: ${esc(p.linkRu)}`, `kk: ${esc(p.linkKk)}`, `Picture: ${esc(p.card)}`);
  }
  head.push("", "Links are tagged for Instagram; for TikTok or Threads change utm_source=instagram to tiktok or threads. Check the price on the site first: it may have changed since this morning.");
  if (!drafts) return [[...head, "", `<i>Drafts withheld: ${esc(withheld ?? "unknown")}. The facts above are real; write the post yourself today.</i>`].join("\n")];
  const lang = (flag: string, d: Drafts["ru"]) => `${flag} <b>Caption</b>\n<pre>${esc(d.caption)}</pre>\n<b>Story</b>\n<pre>${esc(d.story)}</pre>`;
  return [head.join("\n"), lang("🇷🇺", drafts.ru), lang("🇰🇿", drafts.kk)];
}

async function main() {
  const url = process.env.REPORT_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("REPORT_DATABASE_URL (or DATABASE_URL) is not set");
  const sql = postgres(url, { max: 1, idle_timeout: 5, ...connectionOptions(url) });
  try {
    const now = new Date();
    const market = await sql.begin("read only", (tx) => getMarket(tx as unknown as postgres.Sql, now));
    const almaty = new Date(now.getTime() + 5 * 3600_000);
    const weekday = almaty.getUTCDay();
    const iso = almaty.toISOString().slice(0, 10);
    const site = (process.env.SITE_URL?.trim() || "https://bagaapp.com").replace(/\/+$/, "");
    const facts = buildFacts(market, weekday, site, `d${iso.replace(/-/g, "")}`);
    const dayLabel = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(almaty);
    let messages: string[];
    if (!facts) messages = [`<b>Post drafts · ${dayLabel}</b>\nNothing to post today: no find of the day, no week drops and no seller spread in the data.`];
    else {
      const key = process.env.ANTHROPIC_API_KEY?.trim();
      const res = key ? await writeDrafts(facts, key) : { withheld: "ANTHROPIC_API_KEY is not set" };
      messages = renderDrafts(facts, "drafts" in res ? res.drafts : null, "withheld" in res ? res.withheld : null, dayLabel);
    }
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chat = process.env.OWNER_TELEGRAM_CHAT_ID?.trim();
    if (dry || !token || !chat) {
      console.log(messages.join("\n\n———\n\n"));
      if (!dry) console.log("\n(not sent: TELEGRAM_BOT_TOKEN or OWNER_TELEGRAM_CHAT_ID is missing)");
      return;
    }
    for (const html of messages) await sendTelegram(token, chat, { html, buttons: [] });
    console.log(`sent ${messages.length} messages`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
