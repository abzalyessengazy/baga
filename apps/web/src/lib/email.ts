import "server-only";
import { getTranslations } from "next-intl/server";

// Email via Resend (DECISIONS.md, 2026-11-02 "Email alerts with confirmation"). The website sends only the
// confirmation email; alerts are sent by the collector. Not Kaspi: no robots.txt rules apply here.

export const resendKey = () => process.env.RESEND_API_KEY?.trim() || null;
const emailFrom = () => process.env.EMAIL_FROM?.trim() || "BAGA <alerts@bagaapp.com>";

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
}

/** The "confirm your address" email, styled like the worker's alert receipt. */
export async function renderConfirmEmail(locale: "ru" | "kk", confirmUrl: string) {
  const t = await getTranslations({ locale, namespace: "emailConfirm" });
  const url = escapeHtml(confirmUrl);
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#e4e6e9;font-family:Menlo,Consolas,monospace;color:#1d2025">
<table role="presentation" width="100%" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="360" style="background:#fbfbf8;padding:24px;border-radius:4px">
<tr><td style="font-size:20px;font-weight:700;letter-spacing:2px;text-align:center">BAGA</td></tr>
<tr><td style="padding:16px 0;border-bottom:1px dashed #b9bcc2;font-size:14px;line-height:1.5">${escapeHtml(t("lead"))}</td></tr>
<tr><td style="padding-top:20px;text-align:center"><a href="${url}" style="display:inline-block;background:#4b3fd1;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px">${escapeHtml(t("button"))}</a></td></tr>
<tr><td style="padding-top:16px;font-size:12px;color:#5d6168;line-height:1.5">${escapeHtml(t("expires"))}</td></tr>
<tr><td style="padding-top:20px;font-size:11px;color:#8a8e95;text-align:center">${escapeHtml(t("ignore"))}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${t("lead")}\n\n${t("button")}: ${confirmUrl}\n\n${t("expires")}\n\n${t("ignore")}`;
  return { subject: t("subject"), html, text };
}

/**
 * Sends one email. Without RESEND_API_KEY outside production, prints the text to the server log instead so the
 * flow can be tried locally; in production it reports failure.
 */
export async function sendEmail(to: string, msg: { subject: string; html: string; text: string }): Promise<boolean> {
  const key = resendKey();
  if (!key) {
    if (process.env.NODE_ENV === "production") return false;
    console.info(`[email] (not sent, no RESEND_API_KEY) to=${to} subject=${msg.subject}\n${msg.text}`);
    return true;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: emailFrom(), to, subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error(`[email] resend ${res.status}`);
    return res.ok;
  } catch (e) {
    console.error(`[email] ${e}`);
    return false;
  }
}
