import { formatTenge } from "@baga/core";
import type { TelegramButton } from "./telegram";
import type { PushMessage } from "./push";

/**
 * «Ваша цена есть на Halyk Market» (migration 0040; text approved by the owner on 19 Nov 2026): a tracking's target met
 * by an exactly matched store's observed price while Kaspi is still above it. Observed prices only, with the check
 * time; no bonuses or instalments. The Kaspi alert stays on.
 */
type Locale = "ru" | "kk";
const copy = {
  ru: {
    head: (t: string, s: string) => `${t}: ваша цена есть на ${s}`,
    store: (s: string, p: string, at: string) => [`${s}: `, p, ` (проверено сегодня, ${at})`] as const,
    rest: (target: string, kaspi: string) => `Ваша цена: ${target} · Kaspi сейчас: ${kaspi}`,
    note: (s: string) => `Это цена на сайте ${s}, такой же товар; бонусы и рассрочка не учтены. На Kaspi продолжаем следить.`,
    openStore: (s: string) => `Открыть на ${s}`, open: "Открыть в BAĞA", stop: "Отписаться от писем",
    footer: "Вы получили это письмо, потому что следите за ценой в BAĞA и подтвердили этот адрес.",
  },
  kk: {
    head: (t: string, s: string) => `${t}: сіздің бағаңыз ${s} сайтында бар`,
    store: (s: string, p: string, at: string) => [`${s}: `, p, ` (бүгін тексерілді, ${at})`] as const,
    rest: (target: string, kaspi: string) => `Сіздің бағаңыз: ${target} · Kaspi-де қазір: ${kaspi}`,
    note: (s: string) => `Бұл ${s} сайтындағы баға, дәл сол тауар; бонустар мен бөліп төлеу есепке алынбаған. Kaspi-де бақылауды жалғастырамыз.`,
    openStore: (s: string) => `${s} сайтында ашу`, open: "BAĞA-да ашу", stop: "Хат жібермеу",
    footer: "Бұл хат BAĞA-да бағаны бақылап, осы адресті растағаныңыз үшін келді.",
  },
};

export interface StoreTargetMessage {
  locale: Locale; title: string; storeName: string; storePrice: number; observedAt: Date; target: number; kaspi: number;
  storeUrl: string; productUrl: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
const hhmm = (d: Date) => new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Almaty" }).format(d);

function lines(p: StoreTargetMessage, bold: (s: string) => string, e: (s: string) => string) {
  const c = copy[p.locale];
  const f = (n: number) => formatTenge(n, p.locale);
  const [a, price, b] = c.store(e(p.storeName), f(p.storePrice), hhmm(p.observedAt));
  return {
    head: `🎯 ${bold(e(c.head(p.title, p.storeName)))}`,
    store: `${a}${bold(price)}${b}`,
    rest: c.rest(f(p.target), f(p.kaspi)),
    note: e(c.note(p.storeName)),
  };
}

export function renderStoreTargetTelegram(p: StoreTargetMessage): { html: string; buttons: TelegramButton[] } {
  const c = copy[p.locale];
  const l = lines(p, (s) => `<b>${s}</b>`, esc);
  return {
    html: [l.head, "", l.store, l.rest, "", `<i>${l.note}</i>`].join("\n"),
    buttons: [{ text: c.openStore(p.storeName), url: p.storeUrl }, { text: c.open, url: p.productUrl }],
  };
}

export function renderStoreTargetEmail(p: StoreTargetMessage & { stopUrl: string }) {
  const c = copy[p.locale];
  const l = lines(p, (s) => `<b>${s}</b>`, esc);
  const t = lines(p, (s) => s, (s) => s);
  const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";
  const btn = `display:inline-block;box-sizing:border-box;width:260px;max-width:100%;color:#ffffff;font-family:${sans};font-size:15px;font-weight:700;padding:14px 18px;text-decoration:none;border-radius:999px;text-align:center;`;
  const html = `<!doctype html><html lang="${p.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;background:#e4e6e9;color:#1d2025">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fbfbf8;border-radius:6px;padding:28px 24px;font-family:${sans};font-size:15px;line-height:22px">
<tr><td style="font-family:Menlo,Consolas,monospace;font-size:22px;font-weight:700;letter-spacing:4px;text-align:center">BAĞA</td></tr>
<tr><td style="padding:16px 0 14px;border-bottom:2px dashed #b9bcc2;font-size:18px;line-height:24px;color:#5b47e0">${l.head}</td></tr>
<tr><td style="padding-top:14px">${l.store}<br>${esc(l.rest)}</td></tr>
<tr><td style="padding-top:12px;font-size:13px;color:#5d6168"><i>${l.note}</i></td></tr>
<tr><td style="padding:22px 0 6px;text-align:center"><a href="${esc(p.storeUrl)}" style="${btn}background:#1d2025">${esc(c.openStore(p.storeName))}</a></td></tr>
<tr><td style="padding:10px 0 0;text-align:center"><a href="${esc(p.productUrl)}" style="${btn}background:#5b47e0">${c.open}</a></td></tr>
<tr><td style="padding-top:24px;border-top:1px dashed #d9dbe0;font-size:11px;line-height:16px;color:#8a8e95;text-align:center">${c.footer}<br><br><a href="${esc(p.stopUrl)}" style="color:#5d6168">${c.stop}</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = [t.head.replace(/^🎯 /, ""), "", t.store, t.rest, "", t.note, "",
    `${c.openStore(p.storeName)}: ${p.storeUrl}`, `${c.open}: ${p.productUrl}`, "", `${c.stop}: ${p.stopUrl}`, "", c.footer].join("\n");
  return { subject: `🎯 ${c.head(p.title, p.storeName)}`, html, text };
}

/** Browser notification: a tap opens the product's page in BAĞA, which shows the store's price too. */
export function renderStoreTargetPush(p: StoreTargetMessage & { externalId: string; url: string }): PushMessage {
  const c = copy[p.locale];
  const t = lines(p, (s) => s, (s) => s);
  const name = p.title.length > 70 ? `${p.title.slice(0, 69)}…` : p.title;
  return { title: `🎯 ${c.head(name, p.storeName)}`, body: `${t.store}\n${t.rest}`, url: p.url, tag: `baga-store-${p.externalId}` };
}
