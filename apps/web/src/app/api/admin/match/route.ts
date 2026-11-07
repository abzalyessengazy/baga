import { NextResponse, type NextRequest } from "next/server";
import { getSql, decideMatch } from "@baga/db";
import { adminEnabled, isAdmin } from "@/lib/admin";

/** The owner's decision on a pair the store matcher was unsure of (DECISIONS.md, 2026-11-07): same product or not. */
export async function POST(req: NextRequest) {
  if (!adminEnabled() || !(await isAdmin())) return new NextResponse(null, { status: 404 });
  const form = await req.formData().catch(() => null);
  const locale = form?.get("l") === "kk" ? "kk" : "ru";
  const id = Number(form?.get("id"));
  const d = form?.get("d");
  const sql = getSql();
  if (sql && Number.isSafeInteger(id) && id > 0 && (d === "yes" || d === "no")) await decideMatch(sql, id, d === "yes");
  return NextResponse.redirect(new URL(`/${locale}/admin`, req.nextUrl.origin), 303);
}
