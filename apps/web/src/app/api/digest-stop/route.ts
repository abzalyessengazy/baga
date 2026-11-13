import { NextResponse } from "next/server";
import { getSql, stopDigestByCode } from "@baga/db";

const isCode = (v: string) => /^[A-Za-z0-9_-]{16,64}$/.test(v);

/**
 * Stops the 3-day note from its email (price alerts stay). Mail apps POST here with "List-Unsubscribe=One-Click";
 * the button on /[locale]/email?digest=<code> posts the same form with `l`. A plain GET only opens that page, so a
 * link scanner never switches anything off.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const code = String(form?.get("c") ?? url.searchParams.get("c") ?? "");
  const sql = getSql();
  const ok = sql && isCode(code) ? await stopDigestByCode(sql, code).catch(() => false) : false;
  const l = form?.get("l");
  if (l !== "ru" && l !== "kk") return new NextResponse(null, { status: ok ? 200 : 404 });
  return NextResponse.redirect(new URL(`/${l}/email?done=${ok ? "digest_stopped" : "invalid"}`, req.url), 303);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("c") ?? "";
  const l = url.searchParams.get("l") === "kk" ? "kk" : "ru";
  return NextResponse.redirect(new URL(isCode(code) ? `/${l}/email?digest=${code}` : `/${l}/email?done=invalid`, req.url), 303);
}
