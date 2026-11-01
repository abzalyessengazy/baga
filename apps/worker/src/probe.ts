/** Runs the real Kaspi client step by step for one product and prints timings, data or the full error. */
import { createKaspiClient } from "@baga/kaspi";

const id = process.argv[2] ?? "177318181";
const client = createKaspiClient({ timeoutMs: 30_000 });

async function step<T>(name: string, run: () => Promise<T>): Promise<T | null> {
  const t0 = Date.now();
  try {
    const r = await run();
    console.log(`${name.padEnd(14)} OK      ${Date.now() - t0} ms`);
    return r;
  } catch (e) {
    console.log(`${name.padEnd(14)} FAILED  ${Date.now() - t0} ms  ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    return null;
  }
}

console.log(`Node ${process.version}, product ${id}`);
const page = await step("product page", () => client.fetchProductPage(id));
const offers = await step("offers", () => client.fetchOffers(id));
if (page) console.log(`title: ${page.title}`);
if (offers) console.log(`sellers: ${offers.length}, lowest: ${offers[0]?.price} (${offers[0]?.sellerName})`);
process.exitCode = page && offers ? 0 : 1;
