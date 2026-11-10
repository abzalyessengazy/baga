import "server-only";
import { createHash } from "node:crypto";
import { almatyDay, isManualCheckTime } from "@baga/core";
import { getSql, requestManualCheck, manualCheckState, type ManualRequest, type ManualTarget } from "@baga/db";

/**
 * A visitor's own product checked on request outside the collector's window (DECISIONS.md 2026-11-09, CLAUDE.md
 * rule 6). The website never requests Kaspi (Kaspi refuses Vercel): it records the request within the caps
 * (manual_checks) and starts .github/workflows/manual.yml, which runs `pnpm worker --manual` on GitHub, where the
 * daily collector runs too. The workflow's own schedule picks up a request whose start failed.
 */

/** Accepts requests outside the collector's minutes, and from 08:25 UTC, when the job waits for 08:50. */
export function manualAccepted(now = new Date()): boolean {
  const m = now.getUTCHours() * 60 + now.getUTCMinutes();
  return isManualCheckTime(now) || (m >= 8 * 60 + 25 && m < 8 * 60 + 50);
}

/** A daily-rotating hash of the visitor's IP (never the IP itself), for the per-visitor cap. */
function requester(ip: string): string {
  return createHash("sha256").update(`${ip}|${almatyDay()}|${process.env.TURNSTILE_SECRET_KEY ?? ""}`).digest("hex");
}

async function startWorkflow(): Promise<boolean> {
  const token = process.env.GITHUB_DISPATCH_TOKEN, repo = process.env.GITHUB_REPO ?? "abzalyessengazy/baga";
  if (!token) return false;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/manual.yml/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "baga-site" },
      body: JSON.stringify({ ref: "main" }),
      signal: AbortSignal.timeout(4_000),
    });
    if (res.status !== 204) console.error(`[manual] GitHub dispatch answered ${res.status}`);
    return res.status === 204;
  } catch (e) {
    console.error(`[manual] GitHub dispatch failed: ${e}`);
    return false;
  }
}

/** After a visitor's product or link was queued: ask for a manual check when it is the time for one. */
export async function requestManual(target: ManualTarget, ip: string): Promise<ManualRequest | "not_now" | "unavailable"> {
  if (!manualAccepted()) return "not_now";
  const sql = getSql();
  if (!sql) return "unavailable";
  const r = await requestManualCheck(sql, target, requester(ip));
  if (r === "queued") await startWorkflow();
  return r;
}

/** Whether the product or link page should say «проверяем по вашему запросу» and refresh itself. */
export async function manualRunning(target: ManualTarget): Promise<boolean> {
  const sql = getSql();
  if (!sql) return false;
  return (await manualCheckState(sql, target).catch(() => null)) === "running";
}
