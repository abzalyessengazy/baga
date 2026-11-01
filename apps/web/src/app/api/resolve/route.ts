import { NextResponse } from "next/server";
import { parseKaspiUrl, createKaspiClient } from "@baga/kaspi";
import { allow } from "@/lib/rateLimit";

const kaspi = createKaspiClient();

/** Turns pasted text into a Kaspi product id. Never fetches a user-supplied URL except known Kaspi short links. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(`resolve:${ip}`, 30, 60 * 60 * 1000)) return NextResponse.json({ error: "generic" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { input?: unknown };
  const input = typeof body.input === "string" ? body.input.slice(0, 2000) : "";
  let parsed = parseKaspiUrl(input);
  if (!parsed.ok && parsed.reason === "short_link") {
    const m = input.match(/https?:\/\/l\.kaspi\.kz\/[^\s]+/i);
    const target = m ? await kaspi.resolveShortLink(m[0]).catch(() => null) : null;
    if (target) parsed = parseKaspiUrl(target);
  }
  if (!parsed.ok) return NextResponse.json({ error: parsed.reason }, { status: 400 });
  return NextResponse.json({ productId: parsed.productId, slug: parsed.slug });
}
