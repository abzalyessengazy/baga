import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { turnstileSecret, verifyTurnstile } from "./turnstile";

/**
 * One bot check per visit (DECISIONS.md 2026-11-17 "One bot check per visit"): a visitor who passed Turnstile gets a
 * signed 30-minute pass, and the routes that ask for a check (lookup, resolve, email) accept the pass instead of a
 * new token. The rate limits and the manual-check caps stay as they are. The pass is an httpOnly cookie; a second,
 * readable cookie only tells the page it may skip the widget.
 */
export const PASS_COOKIE = "baga_hp";
export const PASS_FLAG = "baga_hp_ok";
const PASS_SECONDS = 30 * 60;

function sign(exp: number, secret: string): string {
  return createHmac("sha256", `baga-human-pass:${secret}`).update(String(exp)).digest("hex");
}

export function makePass(now = Date.now(), secret = turnstileSecret()): string | null {
  if (!secret) return null;
  const exp = Math.floor(now / 1000) + PASS_SECONDS;
  return `${exp}.${sign(exp, secret)}`;
}

export function validPass(value: string | undefined, now = Date.now(), secret = turnstileSecret()): boolean {
  if (!value || !secret) return false;
  const [e, sig] = value.split(".");
  const exp = Number(e);
  if (!Number.isInteger(exp) || exp * 1000 < now || !sig) return false;
  const want = Buffer.from(sign(exp, secret), "hex"), got = Buffer.from(sig, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

const cookieOf = (req: Request, name: string) =>
  req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

/** A valid pass, or else a Turnstile token for this action. `fresh`: a new pass should be set on the response. */
export async function verifyHuman(req: Request, token: unknown, ip: string, action: string) {
  if (validPass(cookieOf(req, PASS_COOKIE))) return { ok: true as const, fresh: false, reason: null };
  const check = await verifyTurnstile(token, ip, { expectedAction: action });
  return check.ok ? { ok: true as const, fresh: true, reason: null } : { ok: false as const, fresh: false, reason: check.reason };
}

/** After a passed check: the pass. After a failed one: the readable flag is cleared, so the page shows the widget. */
export function withPass<T extends NextResponse>(res: T, passed: boolean): T {
  const secure = process.env.NODE_ENV === "production";
  if (passed) {
    const v = makePass();
    if (v) {
      res.cookies.set(PASS_COOKIE, v, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: PASS_SECONDS });
      res.cookies.set(PASS_FLAG, "1", { httpOnly: false, sameSite: "lax", secure, path: "/", maxAge: PASS_SECONDS });
    }
  } else {
    res.cookies.set(PASS_FLAG, "", { path: "/", maxAge: 0 });
    res.cookies.set(PASS_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return res;
}
