import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/**
 * The workers say which products they just checked (DECISIONS.md 2026-11-17 "Fewer cache writes"): product pages are
 * cached for a day, and these are rebuilt on their next visit. Signed with a key derived from TELEGRAM_BOT_TOKEN
 * (apps/worker/src/siteRefresh.ts); at most 200 ids, at most 10 minutes old. Nothing is rebuilt until visited.
 */
export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const body = await req.text();
  const sig = req.headers.get("x-baga-signature") ?? "";
  if (!token || body.length > 20_000) return NextResponse.json({ ok: false }, { status: 400 });
  const key = createHash("sha256").update(`baga-revalidate:${token}`).digest();
  const want = createHmac("sha256", key).update(body).digest();
  const got = Buffer.from(sig, "hex");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return NextResponse.json({ ok: false }, { status: 401 });
  const b = JSON.parse(body) as { ids?: unknown; ts?: unknown };
  if (typeof b.ts !== "number" || Math.abs(Date.now() - b.ts) > 10 * 60_000) return NextResponse.json({ ok: false }, { status: 401 });
  const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string" && /^\d{5,12}$/.test(x)).slice(0, 200) : [];
  for (const id of ids) for (const l of ["ru", "kk"]) revalidatePath(`/${l}/p/${id}`);
  return NextResponse.json({ ok: true, n: ids.length });
}
