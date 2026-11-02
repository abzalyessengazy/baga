import { NextResponse } from "next/server";
import { parseKaspiUrl, createKaspiClient, shortLinkCode, shortLinkUrl } from "@baga/kaspi";
import { allow } from "@/lib/rateLimit";
import { clientIp, verifyTurnstile } from "@/lib/turnstile";
import { queueShortLinkRequest } from "@/lib/product";

// Kaspi often does not answer Vercel at all (2 Nov 2026: hung until the 300 s limit), so give up quickly.
const kaspi = createKaspiClient({ timeoutMs: 4000 });

/**
 * Turns pasted text into a Kaspi product id. Never fetches a user-supplied URL; the only Kaspi request is one
 * non-following GET of https://l.kaspi.kz + a validated short-link path, after Turnstile. When that fails, the
 * link is queued for the collector and the visitor goes to /l/<code> (DECISIONS.md, 2026-11-02).
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
      if (!parsed.ok) console.error("[resolve] short link pointed to:", target);
    }
    if (!parsed.ok) {
      const q = await queueShortLinkRequest(link.code, link.path);
      if (q === "full") return NextResponse.json({ error: "too_many" }, { status: 429 });
      if (q === "unavailable") return NextResponse.json({ error: "short_link" }, { status: 400 });
      return NextResponse.json({ pendingLink: link.code });
    }
  }
  if (!parsed.ok) return NextResponse.json({ error: parsed.reason }, { status: 400 });
  return NextResponse.json({ productId: parsed.productId, slug: parsed.slug });
}
