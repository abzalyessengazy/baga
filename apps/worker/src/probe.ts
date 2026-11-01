/** Runs the real Kaspi client step by step for one product and prints timings, data or the full error. */
import { createKaspiClient } from "@baga/kaspi";
import { isInVisitWindow, KASPI_CRAWL_DELAY_MS } from "@baga/core";

// kaspi.kz/robots.txt: Visit-time 04:00-08:45 UTC. Debugging outside it needs an explicit --force.
if (!isInVisitWindow(new Date()) && !process.argv.includes("--force")) {
  console.log("Outside Kaspi's robots.txt visit window (04:00-08:45 UTC = 09:00-13:45 Almaty). Re-run with --force to probe anyway.");
  process.exit(0);
}

const id = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "177318181";
const client = createKaspiClient({ timeoutMs: 30_000, minIntervalMs: KASPI_CRAWL_DELAY_MS });

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
