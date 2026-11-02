import { formatTenge } from "@baga/core";

/** Email alert texts (like telegram.ts, the worker's copy lives next to its sender). */
type Locale = "ru" | "kk";
const copy = {
  ru: {
    firstSubject: (title: string) => `Цена получена: ${title}`,
    targetSubject: (title: string) => `Цена дошла до вашей: ${title}`,
    firstLead: "Мы получили первую цену товара, за которым вы следите.",
    targetLead: "Цена опустилась до вашей.",
    waitNote: "Напишем, когда цена опустится до вашей.",
    hitNote: "Цена уже не выше вашей.",
    now: "Сейчас на Kaspi",
    target: "Ваша цена",
    seller: "Продавец",
    sellers: "Продавцов",
    noOffers: "сейчас нет в продаже",
    buy: "Открыть на Kaspi",
    change: "Изменить цену",
    stop: "Не присылать письма",
    footer: "Вы получили это письмо, потому что следите за ценой в BAĞA и подтвердили этот адрес.",
  },
  kk: {
    firstSubject: (title: string) => `Баға алынды: ${title}`,
    targetSubject: (title: string) => `Баға сіздің бағаңызға жетті: ${title}`,
    firstLead: "Сіз бақылап отырған тауардың алғашқы бағасын алдық.",
    targetLead: "Баға сіз белгілеген деңгейге түсті.",
    waitNote: "Баға сіздің бағаңызға дейін түскенде жазамыз.",
    hitNote: "Баға сіздің бағаңыздан жоғары емес.",
    now: "Қазір Kaspi-де",
    target: "Сіздің бағаңыз",
    seller: "Сатушы",
    sellers: "Сатушылар",
    noOffers: "қазір сатылымда жоқ",
    buy: "Kaspi-де ашу",
    change: "Бағаны өзгерту",
    stop: "Хат жібермеу",
    footer: "Бұл хат BAĞA-да бағаны бақылап, осы адресті растағаныңыз үшін келді.",
  },
} as const;

export interface AlertEmail {
  type: "first_price" | "target_reached"; locale: Locale; title: string; price: number | null; target: number;
  seller: string | null; offerCount: number; productUrl: string; kaspiUrl: string; stopUrl: string;
}

export function renderAlertEmail(p: AlertEmail) {
  const c = copy[p.locale];
  const f = (n: number) => formatTenge(n, p.locale);
  const first = p.type === "first_price";
  const note = first ? (p.price !== null && p.price <= p.target ? c.hitNote : c.waitNote) : "";
  const rows: [string, string][] = [
    [c.now, p.price !== null ? `<strong>${f(p.price)}</strong>` : c.noOffers],
    [c.target, f(p.target)],
    ...(p.seller && !first ? [[c.seller, escapeHtml(p.seller)] as [string, string]] : []),
    ...(p.offerCount && first ? [[c.sellers, String(p.offerCount)] as [string, string]] : []),
  ];
  const row = ([k, v]: [string, string]) =>
    `<tr><td style="padding:4px 0;color:#5d6168">${k}</td><td style="padding:4px 0;text-align:right">${v}</td></tr>`;
  const html = `<!doctype html><html lang="${p.locale}"><body style="margin:0;background:#e4e6e9;font-family:Menlo,Consolas,monospace;color:#1d2025">
<table role="presentation" width="100%" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="360" style="background:#fbfbf8;padding:24px;border-radius:4px">
<tr><td style="font-size:20px;font-weight:700;letter-spacing:2px;text-align:center">BAĞA</td></tr>
<tr><td style="padding:16px 0;border-bottom:1px dashed #b9bcc2">${first ? c.firstLead : c.targetLead}<br><strong>${escapeHtml(p.title)}</strong></td></tr>
<tr><td><table role="presentation" width="100%" style="font-size:14px;padding-top:8px">${rows.map(row).join("")}</table></td></tr>
${note ? `<tr><td style="padding-top:12px;font-size:13px;color:#5d6168">${note}</td></tr>` : ""}
<tr><td style="padding-top:20px;text-align:center"><a href="${escapeHtml(p.kaspiUrl)}" style="display:inline-block;background:#4b3fd1;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px">${c.buy}</a></td></tr>
<tr><td style="padding-top:12px;text-align:center;font-size:13px"><a href="${escapeHtml(p.productUrl)}" style="color:#4b3fd1">${c.change}</a> · <a href="${escapeHtml(p.stopUrl)}" style="color:#5d6168">${c.stop}</a></td></tr>
<tr><td style="padding-top:20px;font-size:11px;color:#8a8e95;text-align:center">${c.footer}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    first ? c.firstLead : c.targetLead, "", p.title,
    ...rows.map(([k, v]) => `${k}: ${v.replace(/<[^>]+>/g, "")}`),
    ...(note ? ["", note] : []),
    "", `${c.buy}: ${p.kaspiUrl}`, `${c.change}: ${p.productUrl}`, `${c.stop}: ${p.stopUrl}`, "", c.footer,
  ].join("\n");
  return { subject: first ? c.firstSubject(p.title) : c.targetSubject(p.title), html, text };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
}

/**
 * Resend API. `oneClickUrl` takes the RFC 8058 one-click POST (List-Unsubscribe-Post), which Gmail and Yahoo
 * expect from bulk senders. Throws on failure so the notification is marked failed.
 */
export async function sendViaResend(apiKey: string, from: string, to: string, msg: { subject: string; html: string; text: string }, oneClickUrl: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to, subject: msg.subject, html: msg.html, text: msg.text,
      headers: { "List-Unsubscribe": `<${oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as { id: string };
}
