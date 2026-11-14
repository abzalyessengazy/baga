/**
 * Queues the seed catalog (data/seed-products.txt, one Kaspi URL per line) for collection.
 * Makes no Kaspi requests: the collector fetches queued products inside Kaspi's robots.txt visit window.
 * A "# min-price N" line applies to the URLs after it: the collector keeps such a product as a seed product only
 * if its first price is N or more. Rows are queued in file order, which is the order the collector adds them.
 * --front queues them ahead of everything already waiting (the breadth pass, 14 Nov 2026).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseKaspiUrl } from "@baga/kaspi";
import { connectionOptions } from "@baga/db";
import postgres from "postgres";
import { env } from "./env";

const sql = postgres(env.databaseUrl(), { max: 1, ...connectionOptions(env.databaseUrl()) });
const front = process.argv.includes("--front");
const file = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? fileURLToPath(new URL("../data/seed-products.txt", import.meta.url));
const lines = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && (!l.startsWith("#") || /^# min-price \d+$/.test(l)));

let skipped = 0;
let minPrice: number | null = null;
const rows: { id: string; slug: string | null; min: number | null }[] = [];
for (const line of lines) {
  if (line.startsWith("# min-price ")) { minPrice = Number(line.slice(12)); continue; }
  const parsed = parseKaspiUrl(line);
  if (!parsed.ok) { console.warn(`skip (${parsed.reason}): ${line}`); skipped++; continue; }
  rows.push({ id: parsed.productId, slug: parsed.slug ?? null, min: minPrice });
}

// Batches of 500 (one row per query timed out over a slow connection, 5 Nov 2026). added_at keeps the file order,
// which is the order the collector adds them. --front starts a day before the oldest waiting row.
const [first] = front ? await sql<{ at: Date | null }[]>`select min(added_at) as at from seed_queue where status = 'pending'` : [];
const start = front && first?.at ? new Date(first.at.getTime() - 86_400_000) : null;
let queued = 0;
let marked = 0;
for (let i = 0; i < rows.length; i += 500) {
  const b = rows.slice(i, i + 500);
  // Already collected: just make sure it is marked as a seed product.
  const updated = await sql<{ external_id: string }[]>`update products set is_seed = true
    where external_id = any(${b.map((r) => r.id)}) returning external_id`;
  marked += updated.length;
  const have = new Set(updated.map((r) => r.external_id));
  const add = b.filter((r) => !have.has(r.id));
  if (!add.length) continue;
  const inserted = await sql`
    insert into seed_queue (external_id, slug, min_price, added_at)
    select x.id, nullif(x.slug, ''), nullif(x.min_raw, -1), coalesce(${start}::timestamptz, now()) + (${i}::int + x.n) * interval '1 millisecond'
    from unnest(${add.map((r) => r.id)}::text[], ${add.map((r) => r.slug ?? "")}::text[], ${add.map((r) => r.min ?? -1)}::int[])
      with ordinality as x(id, slug, min_raw, n)
    on conflict (external_id) do nothing returning external_id`;
  queued += inserted.length;
  console.log(`${Math.min(i + 500, rows.length)}/${rows.length}`);
}
const [q] = await sql<{ n: number }[]>`select count(*)::int as n from seed_queue where status = 'pending' and attempts < 3`;
console.log(`queued ${queued} new, marked ${marked} existing as seed, skipped ${skipped}; ${q?.n ?? 0} waiting in seed_queue`);
await sql.end();
