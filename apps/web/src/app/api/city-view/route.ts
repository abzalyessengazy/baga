import { NextResponse } from "next/server";
import { isCity } from "@baga/core";
import { allow } from "@/lib/rateLimit";
import { clientIp } from "@/lib/turnstile";
import { cityViewed } from "@/lib/city";

/**
 * A visitor chose a city on a product sold by local shops (DECISIONS.md, 2026-11-10; 2026-11-16 "Cached product
 * pages": the page is cached, so the browser says it). Only cities people choose are asked for a product's sellers
 * (the owner, 14 Nov). Rate-limited.
 */
export async function POST(req: Request) {
  if (!allow(`cityview:${clientIp(req)}`, 60, 60 * 60 * 1000)) return NextResponse.json({ code: "rate_limited" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; city?: unknown };
  const id = typeof b.id === "string" && /^\d{5,12}$/.test(b.id) ? b.id : null;
  if (!id || !isCity(b.city)) return NextResponse.json({ ok: false }, { status: 400 });
  cityViewed(id, b.city);
  return NextResponse.json({ ok: true });
}
