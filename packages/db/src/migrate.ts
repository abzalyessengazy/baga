// Applies SQL files in migrations/ in order, recording them in _migrations. Run manually against production.
import postgres from "postgres";
import { connectionOptions } from "./connection";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { max: 1, ...connectionOptions(url) });
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`;
const done = new Set((await sql<{ name: string }[]>`select name from _migrations`).map((r) => r.name));
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(file)) continue;
  console.log(`applying ${file}`);
  await sql.begin(async (tx) => {
    await tx.unsafe(readFileSync(join(dir, file), "utf8"));
    await tx`insert into _migrations (name) values (${file})`;
  });
}
console.log("migrations up to date");
await sql.end();
