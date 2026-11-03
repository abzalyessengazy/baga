import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * The owner's health page (DECISIONS.md, 2026-11-03 "Admin page"): one secret, ADMIN_TOKEN, set in Vercel. The
 * cookie holds its SHA-256, never the token itself. Without ADMIN_TOKEN the page does not exist.
 */
export const ADMIN_COOKIE = "baga_admin";
const MIN_TOKEN = 24;

const digest = (s: string) => createHash("sha256").update(`baga-admin:${s}`).digest();
const token = () => {
  const t = process.env.ADMIN_TOKEN;
  return t && t.length >= MIN_TOKEN ? t : null;
};

export const adminEnabled = () => token() !== null;

/** The cookie value for a correct token, or null. */
export function adminCookieFor(input: string): string | null {
  const t = token();
  if (!t) return null;
  const a = digest(input), b = digest(t);
  return timingSafeEqual(a, b) ? b.toString("hex") : null;
}

export async function isAdmin(): Promise<boolean> {
  const t = token();
  const v = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!t || !v || !/^[0-9a-f]{64}$/.test(v)) return false;
  return timingSafeEqual(Buffer.from(v, "hex"), digest(t));
}
