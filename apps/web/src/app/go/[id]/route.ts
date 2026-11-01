import { NextResponse } from "next/server";
import { getSql } from "@baga/db";

/** Click-through to Kaspi from emails and product pages; records alert clicks for validation metrics. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{5,12}$/.test(id)) return NextResponse.redirect(new URL("/", req.url));
  const n = new URL(req.url).searchParams.get("n");
  const sql = getSql();
  if (sql && n && /^\d+$/.test(n)) await sql`update notifications set clicked_at = coalesce(clicked_at, now()) where id = ${Number(n)}`.catch(() => {});
  return NextResponse.redirect(`https://kaspi.kz/shop/p/-${id}/`, 302);
}
