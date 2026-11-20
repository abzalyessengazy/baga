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
// The website's role (migration 0034) reaches every table, including ones added after it: a new table has row level
// security on and would otherwise lock the site out of it. Only the policy is added here: the table rights come from
// 0034's default privileges, so a revoke in a migration (0044: the collector's tables are read-only for the site)
// is never undone by a later run.
await sql`do $$ declare t record; begin
  if exists (select 1 from pg_roles where rolname = 'baga_web') then
    for t in select tablename from pg_tables p where schemaname = 'public'
      and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tablename and policyname = 'web_all') loop
      execute format('create policy web_all on public.%I for all to baga_web using (true) with check (true)', t.tablename);
    end loop;
  end if;
end $$`;
console.log("migrations up to date");
await sql.end();
