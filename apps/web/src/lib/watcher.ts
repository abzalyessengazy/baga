import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getSql, createWatcher, getWatcherBySecret, rotateLinkCode, getWatcherTracking, type Watcher } from "@baga/db";

/**
 * Tracking before registration (DECISIONS.md, 2026-11-02): the visitor's secret lives in an httpOnly cookie and in
 * a private link they can open on another device. The database stores only its SHA-256.
 */
export const WATCHER_COOKIE = "baga_w";
/** Anti-abuse cap until accounts and plans exist (Phase 4: 5 free, more on a subscription). */
export const WATCHER_LIMIT = 20;
const YEAR_S = 365 * 24 * 3600;

const isSecret = (v: string | undefined): v is string => !!v && /^[A-Za-z0-9_-]{43}$/.test(v);
export const hashSecret = (s: string) => createHash("sha256").update(s).digest("hex");
const randomCode = () => randomBytes(18).toString("base64url"); // 24 chars, Telegram start param safe

export function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: YEAR_S };
}

/** The visitor's secret from the cookie, if it looks valid. */
export async function watcherSecret(): Promise<string | null> {
  const v = (await cookies()).get(WATCHER_COOKIE)?.value;
  return isSecret(v) ? v : null;
}

export async function currentWatcher(): Promise<{ watcher: Watcher; secret: string } | null> {
  const sql = getSql();
  const secret = await watcherSecret();
  if (!sql || !secret) return null;
  const watcher = await getWatcherBySecret(sql, hashSecret(secret));
  return watcher ? { watcher, secret } : null;
}

/** Route handlers only: returns the visitor's watcher, creating it (and setting the cookie) on first use. */
export async function ensureWatcher(locale: "ru" | "kk"): Promise<Watcher | null> {
  const sql = getSql();
  if (!sql) return null;
  const found = await currentWatcher();
  if (found) return found.watcher;
  const secret = randomBytes(32).toString("base64url");
  const watcher = await createWatcher(sql, hashSecret(secret), locale, randomCode());
  (await cookies()).set(WATCHER_COOKIE, secret, cookieOptions());
  return watcher;
}

export function isValidSecret(v: unknown): v is string {
  return typeof v === "string" && isSecret(v);
}

export function botUsername(): string | null {
  const u = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  return u && /^[A-Za-z0-9_]{5,32}$/.test(u) ? u : null;
}

/** Deep link that connects this watcher's alerts to Telegram, or null when the bot is not configured or linked. */
export async function telegramConnectUrl(w: Watcher): Promise<string | null> {
  const bot = botUsername();
  const sql = getSql();
  if (!bot || !sql || w.telegramChatId) return null;
  let code = w.telegramLinkCode;
  if (!code) { code = randomCode(); await rotateLinkCode(sql, w.id, code); }
  return `https://t.me/${bot}?start=${code}`;
}

/** What the product page's coupon starts with for this visitor. Server components only (no cookie is set). */
export async function trackInitial(externalId: string): Promise<{ target: number | null; linked: boolean; telegramUrl: string | null; botReady: boolean }> {
  const botReady = !!botUsername();
  const found = await currentWatcher().catch(() => null);
  const sql = getSql();
  if (!found || !sql) return { target: null, linked: false, telegramUrl: null, botReady };
  const t = await getWatcherTracking(sql, found.watcher.id, externalId);
  return {
    target: t?.targetPrice ?? null,
    linked: !!found.watcher.telegramChatId,
    telegramUrl: t ? await telegramConnectUrl(found.watcher) : null,
    botReady,
  };
}
