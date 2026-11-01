import { formatTenge } from "@baga/core";

type Locale = "ru" | "kk";
const copy = {
  ru: {
    subject: (title: string) => `Цена достигла цели: ${title}`,
    lead: "Цена опустилась до вашей цели.",
    now: "Сейчас",
    target: "Ваша цель",
    seller: "Продавец",
    buy: "Открыть на Kaspi",
    change: "Изменить цель",
    stop: "Перестать следить",
    footer: "Вы получили это письмо, потому что следите за ценой в BAGA.",
  },
  kk: {
    subject: (title: string) => `Баға мақсатқа жетті: ${title}`,
    lead: "Баға сіз белгілеген деңгейге түсті.",
    now: "Қазір",
    target: "Сіздің мақсатыңыз",
    seller: "Сатушы",
    buy: "Kaspi-де ашу",
    change: "Мақсатты өзгерту",
    stop: "Бақылауды тоқтату",
    footer: "Бұл хат BAGA-да бағаны бақылап отырғаныңыз үшін келді.",
  },
} as const;

export function renderTargetEmail(p: {
  locale: Locale; title: string; price: number; target: number; seller: string | null;
  productUrl: string; kaspiUrl: string; unsubscribeUrl: string;
}) {
  const c = copy[p.locale];
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 0;color:#5d6168">${k}</td><td style="padding:4px 0;text-align:right">${v}</td></tr>`;
  const html = `<!doctype html><html lang="${p.locale}"><body style="margin:0;background:#e4e6e9;font-family:Menlo,Consolas,monospace;color:#1d2025">
<table role="presentation" width="100%" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="360" style="background:#fbfbf8;padding:24px;border-radius:4px">
<tr><td style="font-size:20px;font-weight:700;letter-spacing:2px;text-align:center">BAGA</td></tr>
<tr><td style="padding:16px 0;border-bottom:1px dashed #b9bcc2">${c.lead}<br><strong>${escapeHtml(p.title)}</strong></td></tr>
<tr><td><table role="presentation" width="100%" style="font-size:14px;padding-top:8px">
${row(c.now, `<strong>${formatTenge(p.price, p.locale)}</strong>`)}${row(c.target, formatTenge(p.target, p.locale))}${p.seller ? row(c.seller, escapeHtml(p.seller)) : ""}
</table></td></tr>
<tr><td style="padding-top:20px;text-align:center"><a href="${p.kaspiUrl}" style="display:inline-block;background:#4b3fd1;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px">${c.buy}</a></td></tr>
<tr><td style="padding-top:12px;text-align:center;font-size:13px"><a href="${p.productUrl}" style="color:#4b3fd1">${c.change}</a> · <a href="${p.unsubscribeUrl}" style="color:#5d6168">${c.stop}</a></td></tr>
<tr><td style="padding-top:20px;font-size:11px;color:#8a8e95;text-align:center">${c.footer}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: c.subject(p.title), html };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
}

export async function sendViaResend(apiKey: string, from: string, to: string, subject: string, html: string, unsubscribeUrl: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to, subject, html,
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return (await res.json()) as { id: string };
}
