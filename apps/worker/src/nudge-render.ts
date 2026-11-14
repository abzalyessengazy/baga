import { DIGEST, digestMood, formatTenge, shortTitle, type DigestMood } from "@baga/core";
import type { DigestItem, Suggestion } from "@baga/db";
import type { TelegramButton } from "./telegram";

/**
 * The 3-day note (DECISIONS.md, 2026-11-13 "Profiles, leaderboard and the 3-day note"): what happened to the prices
 * a person tracks, and two or three products worth tracking too. Observed prices only; a rise is reported as a
 * rise, with no promise that it will come back down (CLAUDE.md rule 2: the past, never a forecast). Every note
 * carries a way to stop it that leaves price alerts on.
 */
type Locale = "ru" | "kk";
export const DIGEST_STOP_CALLBACK = "d:stop";

const copy = {
  ru: {
    hello: (nick: string | null) => (nick ? `${nick}, ваши товары за 3 дня` : "Ваши товары за 3 дня"),
    subject: { down: "Что-то из ваших товаров подешевело", up: "Ваши товары за 3 дня: цены выросли", stable: "Ваши товары за 3 дня: цены стабильны" } satisfies Record<DigestMood, string>,
    lead: {
      down: "Хорошая новость: кое-что подешевело.",
      up: "Часть ваших товаров подорожала. Жаль. Мы следим дальше и напишем, когда цена дойдёт до вашей.",
      stable: "Цены на ваши товары за 3 дня не менялись.",
    } satisfies Record<DigestMood, string>,
    more: (n: number) => `и ещё ${n}`,
    also: { down: "Ещё подешевело рядом:", up: "Хотите следить и за этими?", stable: "А может, посмотреть и эти?" } satisfies Record<DigestMood, string>,
    fromHigh: (pct: number) => `−${pct}% от максимума за 30 дней`,
    target: "ваша цена",
    my: "Мои товары",
    stop: "Не присылать сводку",
    note: "Только цены, которые мы сами видели на Kaspi.kz. Перед покупкой проверьте цену на Kaspi.",
    footer: "Сводка приходит раз в 3 дня, потому что вы следите за ценами в BAĞA. Уведомления о ваших ценах от неё не зависят.",
  },
  kk: {
    hello: (nick: string | null) => (nick ? `${nick}, 3 күндегі тауарларыңыз` : "3 күндегі тауарларыңыз"),
    subject: { down: "Тауарларыңыздың бірі арзандады", up: "3 күндегі тауарларыңыз: баға өсті", stable: "3 күндегі тауарларыңыз: баға тұрақты" } satisfies Record<DigestMood, string>,
    lead: {
      down: "Жақсы жаңалық: бір нәрсе арзандады.",
      up: "Тауарларыңыздың бір бөлігі қымбаттады. Өкінішті. Бақылауды жалғастырамыз, баға сіздің бағаңызға жеткенде жазамыз.",
      stable: "3 күнде тауарларыңыздың бағасы өзгерген жоқ.",
    } satisfies Record<DigestMood, string>,
    more: (n: number) => `және тағы ${n}`,
    also: { down: "Қасында тағы арзандағандар:", up: "Мыналарды да бақылағыңыз келе ме?", stable: "Мүмкін, мыналарды да қарап көрерсіз?" } satisfies Record<DigestMood, string>,
    fromHigh: (pct: number) => `30 күндегі ең жоғары бағадан −${pct}%`,
    target: "сіздің бағаңыз",
    my: "Менің тауарларым",
    stop: "Жиынтықты жібермеу",
    note: "Тек Kaspi.kz-те өзіміз көрген бағалар. Сатып алар алдында Kaspi-дегі бағаны тексеріңіз.",
    footer: "Жиынтық 3 күнде бір келеді, себебі сіз BAĞA-да бағаларды бақылайсыз. Баға туралы хабарламалар оған тәуелді емес.",
  },
} as const;

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
const name = (x: { title: string; titleKk: string | null }, l: Locale) => shortTitle((l === "kk" && x.titleKk) || x.title);
/** Drops first, then rises, then the unchanged; the note shows the first DIGEST.maxItems. */
const ordered = (items: DigestItem[]) => [...items].sort((a, b) => (a.move === b.move ? 0 : a.move === -1 ? -1 : b.move === -1 ? 1 : b.move - a.move));

export interface DigestNote { locale: Locale; nickname: string | null; items: DigestItem[]; suggestions: Suggestion[]; site: string }

function parts(p: DigestNote, source: string) {
  const c = copy[p.locale];
  const f = (n: number) => formatTenge(n, p.locale);
  const link = (path: string) => `${p.site}/${p.locale}${path}?utm_source=${source}&utm_medium=digest`;
  const mood = digestMood(p.items.map((i) => i.move));
  const all = ordered(p.items);
  const shown = all.slice(0, DIGEST.maxItems);
  const row = (i: DigestItem) => ({
    sign: i.move === -1 ? "↓" : i.move === 1 ? "↑" : "=", name: name(i, p.locale), url: link(`/p/${i.externalId}`),
    price: i.move === 0 ? f(i.now) : `${f(i.was)} → ${f(i.now)}`,
    diff: i.move === 0 ? "" : `${i.now < i.was ? "−" : "+"}${f(Math.abs(i.now - i.was))}`,
  });
  const sug = p.suggestions.slice(0, DIGEST.suggestions).map((s) => ({
    name: name(s, p.locale), url: link(`/p/${s.externalId}`), price: f(s.price), note: s.pct > 0 ? c.fromHigh(s.pct) : "",
  }));
  return { c, mood, rows: shown.map(row), rest: all.length - shown.length, sug, my: link("/my") };
}

export function renderTelegramDigest(p: DigestNote): { html: string; buttons: TelegramButton[]; previewUrl: string | null } {
  const { c, mood, rows, rest, sug, my } = parts(p, "tg_digest");
  const html = [
    `🧾 <b>${esc(c.hello(p.nickname))}</b>`,
    esc(c.lead[mood]),
    "",
    ...rows.map((r) => `${r.sign} <a href="${r.url}">${esc(r.name)}</a>\n${r.price}${r.diff ? ` · <b>${r.diff}</b>` : ""}`),
    ...(rest > 0 ? [esc(c.more(rest))] : []),
    ...(sug.length ? ["", `<b>${esc(c.also[mood])}</b>`, ...sug.map((s) => `• <a href="${s.url}">${esc(s.name)}</a> — ${s.price}${s.note ? ` (${esc(s.note)})` : ""}`)] : []),
    "",
    `<i>${esc(c.note)}</i>`,
  ].join("\n");
  return { html, buttons: [{ text: c.my, url: my }, { text: c.stop, callback_data: DIGEST_STOP_CALLBACK }], previewUrl: sug[0]?.url ?? null };
}

export function renderEmailDigest(p: DigestNote & { stopUrl: string }): { subject: string; html: string; text: string } {
  const { c, mood, rows, rest, sug, my } = parts(p, "email_digest");
  const tone = (sign: string) => (sign === "↓" ? "#5b47e0" : sign === "↑" ? "#c23b2c" : "#5d6168");
  const html = `<!doctype html><html lang="${p.locale}"><body style="margin:0;background:#e4e6e9;font-family:Menlo,Consolas,monospace;color:#1d2025">
<table role="presentation" width="100%" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="360" style="background:#fbfbf8;padding:24px;border-radius:4px">
<tr><td style="font-size:20px;font-weight:700;letter-spacing:2px;text-align:center">BAĞA</td></tr>
<tr><td style="padding:16px 0;border-bottom:1px dashed #b9bcc2"><strong>${esc(c.hello(p.nickname))}</strong><br>${esc(c.lead[mood])}</td></tr>
${rows.map((r) => `<tr><td style="padding:10px 0;border-bottom:1px dashed #d9dbe0;font-size:14px"><a href="${esc(r.url)}" style="color:#1d2025">${esc(r.name)}</a><br><span style="color:#5d6168">${r.price}</span>${r.diff ? ` <strong style="color:${tone(r.sign)}">${r.sign} ${r.diff}</strong>` : ""}</td></tr>`).join("\n")}
${rest > 0 ? `<tr><td style="padding-top:8px;font-size:13px;color:#5d6168">${esc(c.more(rest))}</td></tr>` : ""}
${sug.length ? `<tr><td style="padding-top:18px;font-size:14px"><strong>${esc(c.also[mood])}</strong></td></tr>
${sug.map((s) => `<tr><td style="padding:8px 0;font-size:14px"><a href="${esc(s.url)}" style="color:#5b47e0">${esc(s.name)}</a><br><span style="color:#5d6168">${s.price}${s.note ? ` · ${esc(s.note)}` : ""}</span></td></tr>`).join("\n")}` : ""}
<tr><td style="padding-top:20px;text-align:center"><a href="${esc(my)}" style="display:inline-block;background:#5b47e0;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px">${c.my}</a></td></tr>
<tr><td style="padding-top:12px;text-align:center;font-size:13px"><a href="${esc(p.stopUrl)}" style="color:#5d6168">${c.stop}</a></td></tr>
<tr><td style="padding-top:20px;font-size:11px;color:#8a8e95;text-align:center">${c.note}<br><br>${c.footer}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    c.hello(p.nickname), c.lead[mood], "",
    ...rows.map((r) => `${r.sign} ${r.name}: ${r.price}${r.diff ? ` (${r.diff})` : ""}\n${r.url}`),
    ...(rest > 0 ? [c.more(rest)] : []),
    ...(sug.length ? ["", c.also[mood], ...sug.map((s) => `• ${s.name} — ${s.price}${s.note ? ` (${s.note})` : ""}\n${s.url}`)] : []),
    "", `${c.my}: ${my}`, `${c.stop}: ${p.stopUrl}`, "", c.note, c.footer,
  ].join("\n");
  return { subject: c.subject[mood], html, text };
}
