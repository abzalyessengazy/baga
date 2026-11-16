import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getSql, getProductByExternalId } from "@baga/db";
import { allow } from "@/lib/rateLimit";
import { clientIp } from "@/lib/turnstile";

/**
 * The cached product page of a product that just got its first price (DECISIONS.md, 2026-11-16 "Cached product
 * pages"): the waiting page asks for a fresh copy before going back to it, so the cached «no price yet» page is not
 * served for the rest of the hour. Only for a product we have; rate-limited. No Kaspi request.
 */
export async function POST(req: Request) {
  if (!allow(`fresh:${clientIp(req)}`, 20, 60 * 60 * 1000)) return NextResponse.json({ code: "rate_limited" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof b.id === "string" && /^\d{5,12}$/.test(b.id) ? b.id : null;
  const sql = getSql();
  if (!id || !sql) return NextResponse.json({ ok: false }, { status: 400 });
  if (!(await getProductByExternalId(sql, id))) return NextResponse.json({ ok: false }, { status: 404 });
  for (const l of ["ru", "kk"]) revalidatePath(`/${l}/p/${id}`);
  return NextResponse.json({ ok: true });
}
