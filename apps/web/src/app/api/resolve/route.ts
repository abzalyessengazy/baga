import { NextResponse } from "next/server";
import { parseKaspiUrl, createKaspiClient, shortLinkCode, shortLinkUrl, variantLinkCode } from "@baga/kaspi";
import { allow } from "@/lib/rateLimit";
import { clientIp, verifyTurnstile } from "@/lib/turnstile";
import { queueShortLinkRequest } from "@/lib/product";
import { requestManual } from "@/lib/manual";

// Kaspi often does not answer Vercel at all (2 Nov 2026: hung until the 300 s limit), so give up quickly.
const kaspi = createKaspiClient({ timeoutMs: 4000 });

/**
 * Turns pasted text into a Kaspi product id. Never fetches a user-supplied URL; the only Kaspi request is one
 * non-following GET of https://l.kaspi.kz + a validated short-link path, after Turnstile. When that fails, the
 * link is queued for the collector and the visitor goes to /l/<code> (DECISIONS.md, 2026-11-02). Variant links
 * (clothes, shoes; the id ends in letters) are always queued for the collector: the website never requests
 * kaspi.kz itself (DECISIONS.md, 2026-11-03). Outside the collector's minutes a queued link also asks for a manual
 * check (DECISIONS.md 2026-11-09, amended 10 Nov), which finds the product on GitHub within minutes.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!allow(`resolve:${ip}`, 30, 60 * 60 * 1000)) return NextResponse.json({ error: "too_many" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { input?: unknown; token?: unknown };
  const input = typeof body.input === "string" ? body.input.slice(0, 2000) : "";
  let parsed = parseKaspiUrl(input);
  if (!parsed.ok && parsed.reason === "short_link") {
    const link = shortLinkCode(input);
    if (!link) return NextResponse.json({ error: "short_link" }, { status: 400 });
    const check = await verifyTurnstile(body.token, ip, { expectedAction: "resolve" });
    if (!check.ok) return NextResponse.json({ error: "check_failed" }, { status: 403 });
    const target = await kaspi.resolveShortLink(shortLinkUrl(link.path)).catch((e) => {
      console.error("[resolve] short link failed:", String(e));
      return null;
    });
    if (target) {
      parsed = parseKaspiUrl(target);
      const variant = parsed.ok ? null : variantLinkCode(target);
      if (variant) return queued(variant.code, variant.path, ip);
      if (!parsed.ok) console.error("[resolve] short link pointed to:", target);
    }
    if (!parsed.ok) return queued(link.code, link.path, ip);
  }
  if (!parsed.ok && parsed.reason === "not_a_product") {
    const variant = variantLinkCode(input);
    if (variant) {
      // Queuing makes the collector send a request, so it takes the same bot check as a short link.
      const check = await verifyTurnstile(body.token, ip, { expectedAction: "resolve" });
      if (!check.ok) return NextResponse.json({ error: "check_failed" }, { status: 403 });
      return queued(variant.code, variant.path, ip);
    }
  }
  if (!parsed.ok) return NextResponse.json({ error: parsed.reason }, { status: 400 });
  return NextResponse.json({ productId: parsed.productId, slug: parsed.slug });
}

/** Waits for the collector: the visitor goes to /l/<code>, where they can already set a price. */
async function queued(code: string, path: string, ip: string) {
  const q = await queueShortLinkRequest(code, path);
  if (q === "full") return NextResponse.json({ error: "too_many" }, { status: 429 });
  if (q === "unavailable") return NextResponse.json({ error: "short_link" }, { status: 400 });
  if (q === "pending") await requestManual({ linkCode: code }, ip).catch((e) => console.error(`[manual] ${e}`));
  return NextResponse.json({ pendingLink: code });
}
