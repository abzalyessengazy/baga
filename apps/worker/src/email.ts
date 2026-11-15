import { formatTenge, isPermanentHttpStatus } from "@baga/core";
import { DeliveryError } from "./telegram";

/** Email alert texts (like telegram.ts, the worker's copy lives next to its sender). */
type Locale = "ru" | "kk";
const copy = {
  ru: {
    firstSubject: (title: string) => `🧾 Проверили цену: ${title}`,
    targetSubject: (title: string) => `🎯 Цена дошла до вашей: ${title}`,
    firstLead: "Проверили цену товара, за которым вы следите.",
    gap: "До вашей цены",
    below: "Ниже вашей на",
    low30: "Самая низкая за 30 дней",
    my: "🧾 Мои товары",
    checkNote: "Цены на Kaspi меняются быстро: проверьте перед покупкой.",
    targetLead: "Цена опустилась до вашей.",
    waitNote: "Напишем, как только цена опустится до вашей.",
    hitNote: "Цена уже не выше вашей.",
    now: "Сейчас на Kaspi",
    target: "Ваша цена",
    seller: "Продавец",
    sellers: "Продавцов",
    noOffers: "сейчас нет в продаже",
    buy: "Открыть в BAĞA",
    change: "Изменить цену",
    stop: "Не присылать письма",
    footer: "Вы получили это письмо, потому что следите за ценой в BAĞA и подтвердили этот адрес.",
    askSubject: (title: string) => `Вы купили? ${title}`,
    askLead: "Недавно цена дошла до вашей. Ответьте одним нажатием — так мы поймём, помогает ли BAĞA.",
    askYes: "Да, купил(а)",
    askLater: "Пока нет",
    askNo: "Нет, передумал(а)",
  },
  kk: {
    firstSubject: (title: string) => `🧾 Бағаны тексердік: ${title}`,
    targetSubject: (title: string) => `🎯 Баға сіздің бағаңызға жетті: ${title}`,
    firstLead: "Сіз бақылап отырған тауардың бағасын тексердік.",
    gap: "Сіздің бағаңызға дейін",
    below: "Сіздің бағаңыздан төмен",
    low30: "30 күндегі ең төмен баға",
    my: "🧾 Менің тауарларым",
    checkNote: "Kaspi-дегі баға тез өзгереді: сатып алар алдында тексеріңіз.",
    targetLead: "Баға сіз белгілеген деңгейге түсті.",
    waitNote: "Баға сіздің бағаңызға дейін түскен бойда жазамыз.",
    hitNote: "Баға сіздің бағаңыздан жоғары емес.",
    now: "Қазір Kaspi-де",
    target: "Сіздің бағаңыз",
    seller: "Сатушы",
    sellers: "Сатушылар",
    noOffers: "қазір сатылымда жоқ",
    buy: "BAĞA-да ашу",
    change: "Бағаны өзгерту",
    stop: "Хат жібермеу",
    footer: "Бұл хат BAĞA-да бағаны бақылап, осы адресті растағаныңыз үшін келді.",
    askSubject: (title: string) => `Сатып алдыңыз ба? ${title}`,
    askLead: "Жақында баға сіздің бағаңызға жетті. Бір рет басып жауап беріңіз — BAĞA көмектесе ме, соны түсінеміз.",
    askYes: "Иә, сатып алдым",
    askLater: "Әзірге жоқ",
    askNo: "Жоқ, ойымнан қайттым",
  },
} as const;

export interface AlertEmail {
  type: "first_price" | "target_reached"; locale: Locale; title: string; price: number | null; target: number | null;
  seller: string | null; offerCount: number; productUrl: string; kaspiUrl: string; stopUrl: string;
  /** Card extras (16 Nov): the lowest daily price of the last 30 days, the product photo, «Мои товары». */
  low30?: number | null; imageUrl?: string | null; myUrl?: string;
}

/**
 * An alert as a receipt card, the 3-day note's look (16 Nov, the owner: «pretty, with icons, easy to read and come
 * back»): the photo, the name, today's price large, the person's target and how far apart they are, the 30-day low,
 * «Открыть в BAĞA» (no Kaspi button: the owner, 16 Nov) and «Мои товары». Observed prices only.
 */
export function renderAlertEmail(p: AlertEmail) {
  const c = copy[p.locale];
  const f = (n: number) => formatTenge(n, p.locale);
  const first = p.type === "first_price";
  const note = first ? (p.price !== null && p.target !== null && p.price <= p.target ? `✅ ${c.hitNote}` : `⏳ ${c.waitNote}`) : `⚡ ${c.checkNote}`;
  const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";
  const mono = "Menlo,Consolas,'Courier New',monospace";
  const gap = p.price !== null && p.target !== null && p.price !== p.target
    ? p.price > p.target
      ? { label: c.gap, value: `${f(p.price - p.target)} (−${Math.max(1, Math.round(((p.price - p.target) / p.price) * 100))}%)`, color: "#5d6168", bg: "#eef0f2" }
      : { label: c.below, value: f(p.target - p.price), color: "#5b47e0", bg: "#ecebfc" }
    : null;
  const rows: [string, string][] = [
    ...(p.target !== null ? [[`🎯 ${c.target}`, f(p.target)] as [string, string]] : []),
    ...(p.low30 && p.price !== null && p.low30 < p.price ? [[`📉 ${c.low30}`, f(p.low30)] as [string, string]] : []),
    ...(p.seller && !first ? [[`🏪 ${c.seller}`, escapeHtml(p.seller)] as [string, string]] : []),
    ...(p.offerCount && first ? [[`👥 ${c.sellers}`, String(p.offerCount)] as [string, string]] : []),
  ];
  const row = ([k, v]: [string, string]) =>
    `<tr><td style="padding:7px 0;font-family:${sans};font-size:14px;color:#5d6168;border-bottom:1px dashed #e3e5e8">${k}</td><td style="padding:7px 0;text-align:right;font-family:${mono};font-size:14px;font-weight:700;color:#1d2025;border-bottom:1px dashed #e3e5e8">${v}</td></tr>`;
  const photo = p.imageUrl
    ? `<a href="${escapeHtml(p.productUrl)}"><img src="${escapeHtml(p.imageUrl)}" width="120" height="120" alt="" style="display:block;margin:0 auto;width:120px;height:120px;object-fit:contain;background:#fff;border:1px solid #e3e5e8;border-radius:12px"></a>`
    : "";
  const html = `<!doctype html><html lang="${p.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;background:#e4e6e9;color:#1d2025">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fbfbf8;border-radius:6px;padding:28px 24px">
<tr><td style="font-family:${mono};font-size:22px;font-weight:700;letter-spacing:4px;text-align:center;color:#1d2025">BAĞA</td></tr>
<tr><td style="padding:16px 0 14px;border-bottom:2px dashed #b9bcc2;text-align:center;font-family:${sans}">
<div style="font-size:19px;line-height:25px;font-weight:700;color:${first ? "#1d2025" : "#5b47e0"}">${first ? "🧾" : "🎯"} ${first ? c.firstLead : c.targetLead}</div></td></tr>
<tr><td style="padding:20px 0 6px">${photo}</td></tr>
<tr><td style="padding:10px 0 0;text-align:center;font-family:${sans}"><a href="${escapeHtml(p.productUrl)}" style="color:#1d2025;text-decoration:none;font-size:16px;line-height:22px;font-weight:600">${escapeHtml(p.title)}</a></td></tr>
<tr><td style="padding:14px 0 0;text-align:center">
<div style="font-family:${sans};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#5d6168">${c.now}</div>
<div style="margin-top:4px;font-family:${mono};font-size:30px;line-height:36px;font-weight:800;color:${!first ? "#5b47e0" : "#1d2025"}">${p.price !== null ? f(p.price) : c.noOffers}</div>
${gap ? `<div style="margin-top:8px"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${gap.bg};color:${gap.color};font-family:${mono};font-size:13px;font-weight:700">${gap.label}: ${gap.value}</span></div>` : ""}
</td></tr>
${rows.length ? `<tr><td style="padding-top:16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(row).join("")}</table></td></tr>` : ""}
<tr><td style="padding-top:14px;font-family:${sans};font-size:14px;line-height:20px;color:#3d4148;text-align:center">${note}</td></tr>
<tr><td style="padding:22px 0 6px;text-align:center"><a href="${escapeHtml(p.productUrl)}" style="display:inline-block;background:#5b47e0;color:#ffffff;font-family:${sans};font-size:16px;font-weight:700;padding:14px 30px;text-decoration:none;border-radius:999px">${c.buy}</a></td></tr>
${p.myUrl ? `<tr><td style="padding-top:10px;text-align:center;font-family:${sans};font-size:14px"><a href="${escapeHtml(p.myUrl)}" style="color:#5b47e0;text-decoration:none;font-weight:600">${c.my}</a></td></tr>` : ""}
<tr><td style="padding-top:8px;text-align:center;font-family:${sans};font-size:13px"><a href="${escapeHtml(p.productUrl)}" style="color:#5d6168">${c.change}</a></td></tr>
<tr><td style="padding-top:24px;border-top:1px dashed #d9dbe0;font-family:${sans};font-size:11px;line-height:16px;color:#8a8e95;text-align:center">${c.footer}<br><br><a href="${escapeHtml(p.stopUrl)}" style="color:#5d6168">${c.stop}</a></td></tr>
</table></td></tr></table></body></html>`;
  const plain = (s: string) => s.replace(/<[^>]+>/g, "");
  const text = [
    first ? c.firstLead : c.targetLead, "", p.title,
    `${c.now}: ${p.price !== null ? f(p.price) : c.noOffers}`,
    ...(gap ? [`${gap.label}: ${gap.value}`] : []),
    ...rows.map(([k, v]) => `${k.replace(/^\S+ /, "")}: ${plain(v)}`),
    "", note.replace(/^\S+ /, ""),
    "", `${c.buy}: ${p.productUrl}`, ...(p.myUrl ? [`${c.my.replace(/^\S+ /, "")}: ${p.myUrl}`] : []),
    `${c.stop}: ${p.stopUrl}`, "", c.footer,
  ].join("\n");
  return { subject: first ? c.firstSubject(p.title) : c.targetSubject(p.title), html, text };
}

/**
 * "Вы купили?" a day after a target alert (migration 0011). Each answer links to the website's answer page, which
 * records it only after a press there, so mail scanners that open links cannot answer for the reader.
 */
export function renderBoughtEmail(p: { locale: Locale; title: string; answerUrl: (a: "yes" | "later" | "no") => string; stopUrl: string }) {
  const c = copy[p.locale];
  const btn = (a: "yes" | "later" | "no", label: string, main: boolean) =>
    `<a href="${escapeHtml(p.answerUrl(a))}" style="display:block;margin-top:8px;padding:12px 16px;text-decoration:none;border-radius:4px;${main
      ? "background:#5b47e0;color:#fff" : "background:#fff;color:#1d2025;border:1px solid #b9bcc2"}">${label}</a>`;
  const html = `<!doctype html><html lang="${p.locale}"><body style="margin:0;background:#e4e6e9;font-family:Menlo,Consolas,monospace;color:#1d2025">
<table role="presentation" width="100%" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="360" style="background:#fbfbf8;padding:24px;border-radius:4px">
<tr><td style="font-size:20px;font-weight:700;letter-spacing:2px;text-align:center">BAĞA</td></tr>
<tr><td style="padding:16px 0;border-bottom:1px dashed #b9bcc2"><strong>${escapeHtml(p.title)}</strong><br><br>${c.askLead}</td></tr>
<tr><td style="padding-top:12px;text-align:center">${btn("yes", c.askYes, true)}${btn("later", c.askLater, false)}${btn("no", c.askNo, false)}</td></tr>
<tr><td style="padding-top:16px;text-align:center;font-size:13px"><a href="${escapeHtml(p.stopUrl)}" style="color:#5d6168">${c.stop}</a></td></tr>
<tr><td style="padding-top:20px;font-size:11px;color:#8a8e95;text-align:center">${c.footer}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    p.title, "", c.askLead, "",
    `${c.askYes}: ${p.answerUrl("yes")}`, `${c.askLater}: ${p.answerUrl("later")}`, `${c.askNo}: ${p.answerUrl("no")}`,
    "", `${c.stop}: ${p.stopUrl}`, "", c.footer,
  ].join("\n");
  return { subject: c.askSubject(p.title), html, text };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
}

/**
 * Resend API. `oneClickUrl` takes the RFC 8058 one-click POST (List-Unsubscribe-Post), which Gmail and Yahoo
 * expect from bulk senders. `idempotencyKey` (the notification's own key) makes Resend drop a repeat of the same
 * email for 24 hours, so a retry after a crash cannot send it twice. Throws a DeliveryError on failure.
 */
export async function sendViaResend(apiKey: string, from: string, to: string, msg: { subject: string; html: string; text: string }, oneClickUrl: string, idempotencyKey: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.slice(0, 256) },
    body: JSON.stringify({
      from, to, subject: msg.subject, html: msg.html, text: msg.text,
      headers: { "List-Unsubscribe": `<${oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new DeliveryError(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`, isPermanentHttpStatus(res.status));
  return (await res.json()) as { id: string };
}
