/** Adds the seed catalog (data/seed-products.txt, one Kaspi URL per line) to the collection schedule. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createKaspiClient, parseKaspiUrl } from "@baga/kaspi";
import { saveSnapshot, connectionOptions } from "@baga/db";
import postgres from "postgres";
import { env } from "./env";

const sql = postgres(env.databaseUrl(), { max: 1, ...connectionOptions(env.databaseUrl()) });
const kaspi = createKaspiClient();
const file = process.argv[2] ?? fileURLToPath(new URL("../data/seed-products.txt", import.meta.url));
const lines = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
let added = 0;
for (const line of lines) {
  const parsed = parseKaspiUrl(line);
  if (!parsed.ok) { console.warn(`skip (${parsed.reason}): ${line}`); continue; }
  const exists = await sql`select 1 from products where external_id = ${parsed.productId}`;
  if (exists.length) { await sql`update products set is_seed = true where external_id = ${parsed.productId}`; continue; }
  try {
    const snap = await kaspi.fetchSnapshot(parsed.productId);
    const { productId } = await saveSnapshot(sql, snap, parsed.slug, null);
    await sql`update products set is_seed = true where id = ${productId}`;
    added++;
  } catch (e) {
    console.error(`failed ${parsed.productId}: ${e}`);
  }
  await new Promise((r) => setTimeout(r, env.requestDelayMs() * 1.5));
}
console.log(`seeded ${added} new products`);
await sql.end();
