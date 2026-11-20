import { NextResponse } from "next/server";
import { isManualCheckTime } from "@baga/core";
import { claimWebKaspiRequest, getSql, recordWebKaspiBlock } from "@baga/db";
import { parseKaspiUrl, createKaspiClient, KaspiHttpError, shortLinkCode, shortLinkUrl, variantLinkCode } from "@baga/kaspi";
import { allow } from "@/lib/rateLimit";
import { clientIp } from "@/lib/turnstile";
import { verifyHuman, withPass } from "@/lib/humanPass";
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
  // A check passed here gives the visitor the 30-minute pass (lib/humanPass.ts).
  let passed = false;
  const out = (r: NextResponse) => (passed ? withPass(r, true) : r);
  if (!parsed.ok && parsed.reason === "short_link") {
    const link = shortLinkCode(input);
    if (!link) return NextResponse.json({ error: "short_link" }, { status: 400 });
    const check = await verifyHuman(req, body.token, ip, "resolve");
    if (!check.ok) return withPass(NextResponse.json({ error: "check_failed" }, { status: 403 }), false);
    passed = check.fresh;
    const target = await resolveSpaced(link.path);
    if (target) {
      parsed = parseKaspiUrl(target);
      const variant = parsed.ok ? null : variantLinkCode(target);
      if (variant) return out(await queued(variant.code, variant.path, ip));
      if (!parsed.ok) console.error("[resolve] short link pointed to:", target);
    }
    if (!parsed.ok) return out(await queued(link.code, link.path, ip));
  }
  if (!parsed.ok && parsed.reason === "not_a_product") {
    const variant = variantLinkCode(input);
    if (variant) {
      // Queuing makes the collector send a request, so it takes the same bot check as a short link.
      const check = await verifyHuman(req, body.token, ip, "resolve");
      if (!check.ok) return withPass(NextResponse.json({ error: "check_failed" }, { status: 403 }), false);
      passed = check.fresh;
      return out(await queued(variant.code, variant.path, ip));
    }
  }
  if (!parsed.ok) return out(NextResponse.json({ error: parsed.reason }, { status: 400 }));
  return out(NextResponse.json({ productId: parsed.productId, slug: parsed.slug }));
}

/**
 * The one Kaspi request, kept to rule 6 (security audit, 20 Nov 2026): never during the collector's minutes, at least
 * 10 s after the last one from any instance, and none for a day after a 403/429 (web_kaspi_gate, migration 0041).
 * Null = not sent or failed: the link is queued for the collector instead.
 */
async function resolveSpaced(path: string): Promise<string | null> {
  const sql = getSql();
  if (!sql || !isManualCheckTime(new Date())) return null;
  if (!(await claimWebKaspiRequest(sql).catch(() => false))) return null;
  return kaspi.resolveShortLink(shortLinkUrl(path)).catch(async (e) => {
    console.error("[resolve] short link failed:", String(e));
    if (e instanceof KaspiHttpError && e.isBlocking) await recordWebKaspiBlock(sql, e.status).catch(() => undefined);
    return null;
  });
}

/** Waits for the collector: the visitor goes to /l/<code>, where they can already set a price. */
async function queued(code: string, path: string, ip: string) {
  const q = await queueShortLinkRequest(code, path);
  if (q === "full") return NextResponse.json({ error: "too_many" }, { status: 429 });
  if (q === "unavailable") return NextResponse.json({ error: "short_link" }, { status: 400 });
  if (q === "pending") await requestManual({ linkCode: code }, ip).catch((e) => console.error(`[manual] ${e}`));
  return NextResponse.json({ pendingLink: code });
}
