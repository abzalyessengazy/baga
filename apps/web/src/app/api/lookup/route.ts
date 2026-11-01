import { NextResponse } from "next/server";
import { allow } from "@/lib/rateLimit";
import { clientIp, verifyTurnstile } from "@/lib/turnstile";
import { queueProductRequest } from "@/lib/product";
import { isValidSlug } from "@baga/core";

/**
 * Queues a visitor's request for a product we don't have yet, after a Turnstile check. The collector fetches it
 * inside Kaspi's robots.txt window; this route never requests Kaspi (DECISIONS.md, 2026-11-01).
 * Body: { id: "<kaspi product id>", slug?: "<slug from the visitor's link>", token: "<turnstile token>" }. The page then reloads and shows when.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  // Second layer behind Turnstile: per visitor and per server instance (best effort on serverless).
  if (!allow(`lookup:${ip}`, 20, 60 * 60 * 1000) || !allow("lookup:all", 30, 60 * 1000)) {
    return NextResponse.json({ error: "too_many" }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; slug?: unknown; token?: unknown };
  const id = typeof body.id === "string" && /^\d{5,12}$/.test(body.id) ? body.id : null;
  if (!id) return NextResponse.json({ error: "not_a_product" }, { status: 400 });

  const check = await verifyTurnstile(body.token, ip, { expectedAction: "lookup" });
  if (!check.ok) {
    if (check.reason === "no_secret") console.error("[turnstile] TURNSTILE_SECRET_KEY is not set; refusing lookups");
    return NextResponse.json({ error: check.reason === "no_secret" ? "generic" : "check_failed" }, { status: check.reason === "no_secret" ? 503 : 403 });
  }

  const r = await queueProductRequest(id, typeof body.slug === "string" && isValidSlug(body.slug) ? body.slug : null);
  if (r === "queued" || r === "exists") return NextResponse.json({ ok: true });
  if (r === "full") return NextResponse.json({ error: "too_many" }, { status: 429 });
  return NextResponse.json({ error: "generic" }, { status: 503 });
}
