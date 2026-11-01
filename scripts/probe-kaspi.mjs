// Diagnoses why server-side requests to Kaspi fail. Run: node scripts/probe-kaspi.mjs [productId]
// Tries the product page and the offers endpoint with different request headers and prints what Kaspi answers.
const id = process.argv[2] ?? "177318181";
const city = "750000000";
const browserUA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const variants = {
  "old site UA (with URL)": {
    "User-Agent": "BAGA price history bot (+https://github.com/baga-kz; contact: hello@baga.app)",
    "Accept-Language": "ru-RU,ru;q=0.9",
  },
  "bot UA": { "User-Agent": "BAGA price history bot (+contact: hello@baga.app)" },
  "browser UA": { "User-Agent": browserUA, "Accept-Language": "ru-RU,ru;q=0.9" },
  "browser UA + full headers": {
    "User-Agent": browserUA,
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    Origin: "https://kaspi.kz",
  },
};

async function attempt(label, url, init) {
  try {
    const res = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    const marker = text.includes("BACKEND.components.item = ");
    const json = text.trimStart().startsWith("{");
    console.log(`${label.padEnd(44)} ${res.status}  ${String(text.length).padStart(7)} bytes  ${marker ? "product data: yes" : json ? "json" : "first: " + JSON.stringify(text.slice(0, 80))}${res.headers.get("location") ? "  -> " + res.headers.get("location") : ""}`);
  } catch (e) {
    console.log(`${label.padEnd(44)} ERROR ${e.cause?.code ?? ""} ${e.message}`);
  }
}

console.log(`Node ${process.version}, product ${id}\n`);
for (const [name, headers] of Object.entries(variants)) {
  await attempt(`page    | ${name}`, `https://kaspi.kz/shop/p/-${id}/?c=${city}`, { headers: { Accept: "text/html", ...headers } });
  await attempt(`offers  | ${name}`, `https://kaspi.kz/yml/offer-view/offers/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/*", "X-KS-City": city, Referer: `https://kaspi.kz/shop/p/-${id}/`, ...headers },
    body: JSON.stringify({ cityId: city, id, merchantUID: [], limit: 5, page: 0, sortOption: "PRICE", highRating: null, searchText: null, isExcellentMerchant: false, zoneId: [], installationId: "-1" }),
  });
  await new Promise((r) => setTimeout(r, 1200));
}
