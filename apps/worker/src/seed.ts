/**
 * Queues the seed catalog (data/seed-products.txt, one Kaspi URL per line) for collection.
 * Makes no Kaspi requests: the collector fetches queued products inside Kaspi's robots.txt visit window.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseKaspiUrl } from "@baga/kaspi";
import { connectionOptions } from "@baga/db";
import postgres from "postgres";
import { env } from "./env";

const sql = postgres(env.databaseUrl(), { max: 1, ...connectionOptions(env.databaseUrl()) });
const file = process.argv[2] ?? fileURLToPath(new URL("../data/seed-products.txt", import.meta.url));
const lines = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

let queued = 0;
let marked = 0;
let skipped = 0;
for (const line of lines) {
  const parsed = parseKaspiUrl(line);
  if (!parsed.ok) { console.warn(`skip (${parsed.reason}): ${line}`); skipped++; continue; }
  // Already collected: just make sure it is marked as a seed product.
  const updated = await sql`update products set is_seed = true where external_id = ${parsed.productId} returning id`;
  if (updated.length) { marked++; continue; }
  const inserted = await sql`insert into seed_queue (external_id, slug) values (${parsed.productId}, ${parsed.slug})
    on conflict (external_id) do nothing returning external_id`;
  if (inserted.length) queued++;
}
const [q] = await sql<{ n: number }[]>`select count(*)::int as n from seed_queue where status = 'pending' and attempts < 3`;
console.log(`queued ${queued} new, marked ${marked} existing as seed, skipped ${skipped}; ${q?.n ?? 0} waiting in seed_queue`);
await sql.end();
