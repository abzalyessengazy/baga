import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, adminCookieFor, adminEnabled } from "@/lib/admin";
import { allow } from "@/lib/rateLimit";

/** Owner sign-in for /admin: a POSTed token becomes an httpOnly cookie (DECISIONS.md, 2026-11-03 "Admin page"). */
export async function POST(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  const form = await req.formData().catch(() => null);
  const locale = form?.get("l") === "kk" ? "kk" : "ru";
  const back = new URL(`/${locale}/admin`, req.nextUrl.origin);
  if (!allow(`admin:${ip}`, 5, 15 * 60_000)) return NextResponse.redirect(back, 303);
  const value = adminCookieFor(String(form?.get("token") ?? ""));
  const res = NextResponse.redirect(back, 303);
  if (value) {
    res.cookies.set(ADMIN_COOKIE, value, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 30 * 24 * 3600,
    });
  }
  return res;
}
