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
    same: "цена не менялась",
    my: "Мои товары",
    stop: "🔕 Не присылать сводку",
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
    same: "баға өзгерген жоқ",
    my: "Менің тауарларым",
    stop: "🔕 Жиынтықты жібермеу",
    note: "Тек Kaspi.kz-те өзіміз көрген бағалар. Сатып алар алдында Kaspi-дегі бағаны тексеріңіз.",
    footer: "Жиынтық 3 күнде бір келеді, себебі сіз BAĞA-да бағаларды бақылайсыз. Баға туралы хабарламалар оған тәуелді емес.",
  },
} as const;

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
const name = (x: { title: string; titleKk: string | null }, l: Locale) => shortTitle((l === "kk" && x.titleKk) || x.title);
/** A name short enough for one line of a chat bubble or a button: whole words up to `max` characters. */
export function brief(s: string, max = 34): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1).replace(/[\s,/(]+\S*$/, "").replace(/[\s,/(]+$/, "");
  return `${cut || s.slice(0, max)}…`;
}
/** Drops first, then rises, then the unchanged; the note shows the first DIGEST.maxItems. */
const ordered = (items: DigestItem[]) => [...items].sort((a, b) => (a.move === b.move ? 0 : a.move === -1 ? -1 : b.move === -1 ? 1 : b.move - a.move));

export interface DigestNote {
  locale: Locale; nickname: string | null; items: DigestItem[]; suggestions: Suggestion[]; site: string;
  /** The person's sign-in code (migration 0032): every BAĞA link in the note then signs the reader in. */
  accessCode?: string | null;
}

function parts(p: DigestNote, source: string) {
  const c = copy[p.locale];
  const f = (n: number) => formatTenge(n, p.locale);
  // With a code, each link goes through /api/my/enter, so it opens the person's own list in any browser (Telegram's
  // own included; DECISIONS.md 2026-11-16 "Sign-in links in alerts").
  const link = (path: string) => {
    const page = `/${p.locale}${path}?utm_source=${source}&utm_medium=digest`;
    return p.accessCode ? `${p.site}/api/my/enter?c=${p.accessCode}&l=${p.locale}&to=${encodeURIComponent(page)}` : `${p.site}${page}`;
  };
  const mood = digestMood(p.items.map((i) => i.move));
  const all = ordered(p.items);
  const shown = all.slice(0, DIGEST.maxItems);
  const row = (i: DigestItem) => ({
    move: i.move, sign: i.move === -1 ? "↓" : i.move === 1 ? "↑" : "=", name: name(i, p.locale), url: link(`/p/${i.externalId}`), image: i.imageUrl,
    now: f(i.now), was: i.move === 0 ? null : f(i.was), price: i.move === 0 ? f(i.now) : `${f(i.was)} → ${f(i.now)}`,
    diff: i.move === 0 ? "" : `${i.now < i.was ? "−" : "+"}${f(Math.abs(i.now - i.was))}`,
  });
  const sug = p.suggestions.slice(0, DIGEST.suggestions).map((s) => ({
    name: name(s, p.locale), url: link(`/p/${s.externalId}`), image: s.imageUrl, price: f(s.price), pct: s.pct, note: s.pct > 0 ? c.fromHigh(s.pct) : "",
  }));
  return { c, mood, rows: shown.map(row), rest: all.length - shown.length, sug, my: link("/my") };
}

const ICON = { [-1]: "📉", 0: "▫️", 1: "📈" } as const;

/**
 * Telegram: the product photos as an album first (Kaspi's own picture links, fetched by Telegram as a browser would
 * show them; never by our server, CLAUDE.md rule 6), then the note: one block per product (name as a link, the price
 * now in bold, the change and the old price), and the suggestions as buttons with their price.
 */
export function renderTelegramDigest(p: DigestNote): { html: string; buttons: TelegramButton[]; previewUrl: string | null; photos: string[] } {
  const { c, mood, rows, rest, sug, my } = parts(p, "tg_digest");
  const block = (r: ReturnType<typeof parts>["rows"][number]) => [
    `${ICON[r.move]} <a href="${r.url}"><b>${esc(brief(r.name, 48))}</b></a>`,
    r.move === 0 ? `<b>${r.now}</b> · ${esc(c.same)}` : `<b>${r.now}</b>  ${r.sign} ${r.diff}  <s>${r.was}</s>`,
  ].join("\n");
  const html = [
    `🧾 <b>${esc(c.hello(p.nickname))}</b>`,
    `<i>${esc(c.lead[mood])}</i>`,
    "",
    rows.map(block).join("\n\n"),
    ...(rest > 0 ? ["", esc(c.more(rest))] : []),
    "",
    `<i>${esc(c.note)}</i>`,
    ...(sug.length ? ["", `👇 <b>${esc(c.also[mood])}</b>`] : []),
  ].join("\n");
  const buttons: TelegramButton[] = [
    ...sug.map((s) => ({ text: `${s.pct > 0 ? `−${s.pct}% · ` : ""}${brief(s.name, 26)} · ${s.price}`, url: s.url })),
    { text: `🧾 ${c.my}`, url: my },
    { text: c.stop, callback_data: DIGEST_STOP_CALLBACK },
  ];
  const photos = rows.map((r) => r.image).filter((u): u is string => !!u).slice(0, 10);
  return { html, buttons, previewUrl: null, photos };
}

/** Email: the same note as a receipt card, each product with its photo (shown by the reader's mail app). */
export function renderEmailDigest(p: DigestNote & { stopUrl: string }): { subject: string; html: string; text: string } {
  const { c, mood, rows, rest, sug, my } = parts(p, "email_digest");
  const tone = (move: number) => (move === -1 ? "#5b47e0" : move === 1 ? "#c23b2c" : "#5d6168");
  const pill = (move: number) => (move === -1 ? "#ecebfc" : move === 1 ? "#fbeceb" : "#eef0f2");
  const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";
  const mono = "Menlo,Consolas,'Courier New',monospace";
  const img = (src: string | null, url: string) => src
    ? `<a href="${esc(url)}"><img src="${esc(src)}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:contain;background:#fff;border:1px solid #e3e5e8;border-radius:8px"></a>`
    : `<div style="width:64px;height:64px;background:#eef0f2;border-radius:8px"></div>`;
  const item = (r: ReturnType<typeof parts>["rows"][number]) => `<tr><td style="padding:14px 0;border-bottom:1px dashed #d9dbe0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="76" valign="top">${img(r.image, r.url)}</td>
<td valign="top" style="font-family:${sans}">
<a href="${esc(r.url)}" style="color:#1d2025;text-decoration:none;font-size:15px;line-height:20px;font-weight:600">${esc(r.name)}</a>
<div style="margin-top:6px;font-family:${mono};font-size:17px;font-weight:700;color:#1d2025">${r.now}</div>
${r.move === 0
    ? `<div style="margin-top:4px;font-size:13px;color:#5d6168">${esc(c.same)}</div>`
    : `<div style="margin-top:6px"><span style="display:inline-block;padding:3px 8px;border-radius:999px;background:${pill(r.move)};color:${tone(r.move)};font-family:${mono};font-size:13px;font-weight:700">${r.sign} ${r.diff}</span> <span style="font-family:${mono};font-size:13px;color:#8a8e95;text-decoration:line-through">${r.was}</span></div>`}
</td></tr></table></td></tr>`;
  const suggestion = (s: ReturnType<typeof parts>["sug"][number]) => `<tr><td style="padding:10px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="76" valign="top">${img(s.image, s.url)}</td>
<td valign="top" style="font-family:${sans}"><a href="${esc(s.url)}" style="color:#5b47e0;text-decoration:none;font-size:14px;line-height:19px;font-weight:600">${esc(s.name)}</a>
<div style="margin-top:4px;font-family:${mono};font-size:14px;color:#1d2025"><strong>${s.price}</strong>${s.note ? ` <span style="color:#5d6168;font-size:12px">· ${esc(s.note)}</span>` : ""}</div></td>
</tr></table></td></tr>`;
  const html = `<!doctype html><html lang="${p.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;background:#e4e6e9;color:#1d2025">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fbfbf8;border-radius:6px;padding:28px 24px">
<tr><td style="font-family:${mono};font-size:22px;font-weight:700;letter-spacing:4px;text-align:center;color:#1d2025">BAĞA</td></tr>
<tr><td style="padding:18px 0 16px;border-bottom:2px dashed #b9bcc2;font-family:${sans}">
<div style="font-size:19px;line-height:25px;font-weight:700">${esc(c.hello(p.nickname))}</div>
<div style="margin-top:6px;font-size:15px;line-height:21px;color:#3d4148">${esc(c.lead[mood])}</div></td></tr>
${rows.map(item).join("\n")}
${rest > 0 ? `<tr><td style="padding-top:10px;font-family:${sans};font-size:13px;color:#5d6168">${esc(c.more(rest))}</td></tr>` : ""}
<tr><td style="padding:22px 0 6px;text-align:center"><a href="${esc(my)}" style="display:inline-block;background:#5b47e0;color:#ffffff;font-family:${sans};font-size:15px;font-weight:600;padding:13px 26px;text-decoration:none;border-radius:999px">${c.my}</a></td></tr>
${sug.length ? `<tr><td style="padding-top:22px;font-family:${sans};font-size:15px;font-weight:700">${esc(c.also[mood])}</td></tr>
${sug.map(suggestion).join("\n")}` : ""}
<tr><td style="padding-top:24px;border-top:1px dashed #d9dbe0;font-family:${sans};font-size:11px;line-height:16px;color:#8a8e95;text-align:center">${c.note}<br><br>${c.footer}<br><br><a href="${esc(p.stopUrl)}" style="color:#5d6168">${c.stop}</a></td></tr>
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
