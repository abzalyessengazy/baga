// Cloudflare Turnstile (DECISIONS.md, 2026-11-01). Server-side token verification; used by route handlers only.

/** Cloudflare's documented always-pass test keys. Used only outside production when no keys are set. */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The secret to verify with, or null when lookups must be refused (production without keys: fail closed). */
export function turnstileSecret(env: Record<string, string | undefined> = process.env): string | null {
  if (env.TURNSTILE_SECRET_KEY) return env.TURNSTILE_SECRET_KEY;
  return env.NODE_ENV === "production" ? null : TURNSTILE_TEST_SECRET;
}

export type TurnstileResult = { ok: true } | { ok: false; reason: "no_secret" | "missing_token" | "rejected" | "unreachable" };

/** Verifies a widget token with Cloudflare. Tokens are single-use and expire after 5 minutes. */
export async function verifyTurnstile(
  token: unknown,
  ip: string | null,
  opts: { secret?: string | null; fetch?: typeof fetch; expectedAction?: string } = {},
): Promise<TurnstileResult> {
  const secret = opts.secret === undefined ? turnstileSecret() : opts.secret;
  if (!secret) return { ok: false, reason: "no_secret" };
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return { ok: false, reason: "missing_token" };
  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "local") body.set("remoteip", ip);
  try {
    const res = await (opts.fetch ?? fetch)(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(8_000) });
    const data = (await res.json()) as { success?: boolean; action?: string };
    if (!data.success) return { ok: false, reason: "rejected" };
    if (opts.expectedAction && data.action && data.action !== opts.expectedAction) return { ok: false, reason: "rejected" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/** Client IP as Vercel reports it (first x-forwarded-for entry). */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
