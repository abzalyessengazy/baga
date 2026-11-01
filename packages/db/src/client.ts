import postgres from "postgres";
import { connectionOptions } from "./connection";

let sql: postgres.Sql | null = null;

/** Server-only Postgres client. Returns null when DATABASE_URL is not configured (local UI work). */
export function getSql(): postgres.Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  sql ??= postgres(url, { max: 5, idle_timeout: 20, ...connectionOptions(url) });
  return sql;
}
