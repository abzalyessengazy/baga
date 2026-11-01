import { NextResponse } from "next/server";
import { allow } from "@/lib/rateLimit";
import { clientIp } from "@/lib/turnstile";
import { searchCatalog } from "@/lib/catalog";

/** GET /api/search?q=… — BAGA's own catalog only; never contacts Kaspi. */
export async function GET(req: Request) {
  if (!allow(`search:${clientIp(req)}`, 120, 60 * 1000)) return NextResponse.json({ error: "too_many" }, { status: 429 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 120);
  if (q.trim().length < 2) return NextResponse.json({ items: [] });
  try {
    return NextResponse.json({ items: await searchCatalog(q) }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (e) {
    console.error("[search] failed:", e);
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }
}
