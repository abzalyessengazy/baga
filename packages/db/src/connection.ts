import { SUPABASE_ROOT_CA } from "./supabase-ca";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type SslOption = false | { ca?: string; rejectUnauthorized: true };

/**
 * TLS settings for a Postgres URL (postgres.js defaults to no TLS at all):
 * - an explicit `sslmode` in the URL wins (postgres.js reads it itself);
 * - Supabase hosts: verified TLS against the Supabase root CA;
 * - other remote hosts: verified TLS against the system CAs;
 * - localhost: plain (local dev/test databases).
 */
export function sslFor(url: string): SslOption | undefined {
  const u = new URL(url);
  if (u.searchParams.has("sslmode")) return undefined;
  const host = u.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host)) return false;
  if (host.endsWith(".supabase.com") || host.endsWith(".supabase.co")) return { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true };
  return { rejectUnauthorized: true };
}

/** Shared postgres.js options. prepare: false because the Supabase transaction pooler does not support prepared statements. */
export function connectionOptions(url: string) {
  const ssl = sslFor(url);
  return { prepare: false, ...(ssl === undefined ? {} : { ssl }) } as const;
}
