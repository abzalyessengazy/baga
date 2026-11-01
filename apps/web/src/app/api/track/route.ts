import { NextResponse } from "next/server";
import { getSql } from "@baga/db";
import { allow } from "@/lib/rateLimit";

/**
 * Phase 3: records interest (email + product + target) so testers can be notified when alerts launch.
 * Phase 4 replaces this with Supabase magic-link sign-in and real trackings.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(`track:${ip}`, 10, 60 * 60 * 1000)) return NextResponse.json({ code: "rate_limited" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { email?: string; productId?: string; target?: number; locale?: string };
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) return NextResponse.json({ code: "invalid_email" }, { status: 400 });
  if (!Number.isInteger(b.target) || (b.target ?? 0) <= 0) return NextResponse.json({ code: "invalid_target" }, { status: 400 });
  const sql = getSql();
  if (!sql) return NextResponse.json({ code: "not_ready" }, { status: 503 });
  const [p] = await sql<{ id: number }[]>`select id from products where external_id = ${String(b.productId ?? "")}`;
  await sql`insert into feedback (product_id, kind, text) values (${p?.id ?? null}, 'waitlist',
    ${JSON.stringify({ email, target: b.target, locale: b.locale === "kk" ? "kk" : "ru" })})`;
  return NextResponse.json({ code: "waitlisted" });
}
