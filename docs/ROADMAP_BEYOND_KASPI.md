# Beyond Kaspi: a plan for a future milestone

Drafted 17 Nov 2026 at the owner's request. Not the current milestone: nothing here is built until the owner picks it.

## The goal

BAĞA answers one question better than anyone: **"Is this a good moment and a good place to buy this?"** Today the answer uses Kaspi only. The goal is to make the answer market-wide, without becoming a catalogue (PiuPiu has ~110k products from 7 chains; copying it is not the point).

So the rule for every new source: **we add a store's price only for products people track or open**, matched exactly, and show it inside the verdict («на Halyk Market на 12 000 ₸ дешевле, проверено сегодня 10:40»). No browsing other stores' catalogues on BAĞA.

Two side effects matter as much as the feature:
- **Less dependence on Kaspi.** If Kaspi ever blocks us, BAĞA still tells people where a product is cheapest.
- **A stronger verdict.** "The cheapest on Kaspi" becomes "the cheapest in Kazakhstan", which no competitor offers for Kaspi shoppers.

## What we have now

| Source | How | State |
|---|---|---|
| Kaspi | Our collector, 04:00–08:45 UTC, 10 s apart (~1 650 requests a day) | Main source |
| Kaspi (manual checks) | MarketParser API | Live since 17 Nov, trial until 1 Dec |
| Technodom | Our store run; exact match through the Kaspi link on Technodom's page | Live |
| Sulpak | Our store run; category listings + title matching | Live |

## Candidates

| Source | What it is | Access (robots.txt, 17 Nov) | Value for BAĞA | Verdict |
|---|---|---|---|---|
| **Halyk Market** (halykmarket.kz) | Halyk Bank's marketplace; the closest thing to Kaspi (bank + card + installments). Top-5 marketplace in KZ by taxes paid; small next to Kaspi | Product pages allowed; only `/api/`, `/profile`, `/checkout`, `/login`, `/cms/` disallowed; no Crawl-delay; a sitemap index with ~1 500 product sitemaps | **High.** The natural "second opinion" for a Kaspi shopper: same products, same installment habit, a different bank | **First.** Probe now |
| **Alser** (alser.kz) | Electronics chain | Product pages allowed; `/api/`, `/search/` disallowed; sitemap index | Medium-high for electronics, our core | Second |
| **Mechta** (mechta.kz) | Electronics chain | robots.txt answered 403 to an automated fetch | Medium-high | Probe carefully; if a polite bot is refused, it's out (rule 6a) |
| **Wildberries, Ozon** | The two big foreign marketplaces, growing in KZ (Kaspi's share fell from 52% to 48% in one study) | Heavy anti-bot; we will not crawl them ourselves | High for clothes, home and cosmetics, where Kaspi is weaker | **Through MarketParser** (it lists Wildberries and Ozon); test on its trial |
| **Freedom Market** (ex-Teez) | Announced by Freedom Holding (28 Oct 2026); not launched, no public site | — | Unknown | **Watch.** Revisit when it opens |
| **Direct sellers** | Shops that sell on Kaspi, Halyk and their own sites | Data they give us | High, and the start of a business model | See below |

## Direct sellers: the idea worth building

Every serious Kaspi seller already keeps a **price feed** (the XML/YML price list Kaspi and Halyk Market require, regenerated whenever they change prices). We ask sellers for the feed's URL.

**What the seller gets:**
- People tracking a product hear about it the moment that seller drops the price: «Магазин X снизил цену до 389 990 ₸».
- A "price kept by the seller" badge.
- Later, statistics: how many people are waiting for a price on their products.

**What BAĞA gets:**
- Prices for those sellers' products **without a single request to Kaspi**, updated as often as the seller changes them.
- A first paying customer type (sellers), long before any shopper pays.

**Rules that keep it honest** (rule 2: never fabricate prices):
- Each feed price is shown as «по данным продавца» with its time.
- Our own checks spot-check it: a seller whose feed price differs from what Kaspi shows loses the badge and the feed.
- An alert fires on a feed price only after our own check (or MarketParser) confirms it.

**The hard part is matching.** Feeds carry the seller's own SKU and model name, not Kaspi's product number. Sellers can add the Kaspi number as a column; the ones who want the traffic will.

## One matching engine for every store

Technodom matches through the Kaspi link on its page; Sulpak through titles. A shared matcher should try, in order:
1. **Barcode (EAN/GTIN)** from the store page's product data. Exact, and works across every store that publishes it. We do not store Kaspi barcodes today (the barcode drawn on our product page is decoration); step 0 checks whether Kaspi's product page we already read carries one.
2. **The manufacturer's model code** (e.g. `MDH74`, `SM-S946B`, `83S000HPRK`).
3. **Title + colour + memory**, the Sulpak rules, as "similar" only, never "the same".

## The milestone, step by step

**Step 0: probes (about a week; research only, no product changes).**
- Halyk Market: 30 tracked products, following robots.txt, 10 s apart, one request at a time, never alongside a Kaspi request. Is the price in the page HTML? Is a barcode or model code there? How many of our 30 does it sell?
- Alser: the same.
- Mechta: one polite robots.txt request with our User-Agent; continue only if allowed.
- Wildberries/Ozon through MarketParser's trial: 10 products each. Does it cover Kazakhstan prices in tenge?
- Direct sellers: talk to 3 Kaspi sellers you know; would they share their feed URL for alerts and a badge?

**Step 1: the shared matcher** (barcode → model code → title), with tests on all the probe data.

**Step 2: Halyk Market live** for tracked and opened products, in the store run, with its own circuit breaker; then Alser, then Mechta if allowed.

**Step 3: "Где дешевле" in the verdict and in alerts.** «На Halyk Market сейчас 379 990 ₸ — на 10 000 ₸ дешевле Kaspi» on the product page, and the same line in the Telegram/email alert when another store crosses someone's target.

**Step 4: direct-seller feeds** for a first 5–10 sellers: a sign-up page, feed reading, spot checks, the badge.

**Step 5 (if MarketParser goes paid): Wildberries and Ozon** through it for categories where Kaspi is weak.

## How we'll know it worked

- **Coverage:** the share of tracked products with at least one other store's price (today: Technodom + Sulpak only).
- **Verdict impact:** how often the cheapest place is not Kaspi, and by how much.
- **Clicks:** clicks to other stores from the product page and from alerts.
- **Sellers:** the number of seller feeds and how often our spot checks agree with them.
- **Resilience:** the share of tracked products we could still price for a day with Kaspi unavailable.

## Open questions for the owner

1. Halyk Market first: agree?
2. Direct sellers: do you know 3 Kaspi sellers to ask?
3. Wildberries/Ozon through MarketParser only (never our own crawler): agree?
4. Do installments matter for the comparison (Kaspi Red 0-0-12 vs Halyk's)? It's a strong verdict line but needs each store's terms.

## Sources
- Halyk Market in the top 5 marketplaces: [Digital Business, 3 Mar 2026](https://digitalbusiness.kz/2026-03-03/halyk-market-voshel-v-top-5-marketpleysov-kazahstana-po-itogam-issledovaniya-ranking-kz/)
- Kaspi's share 52% → 48%; marketplaces' taxes: [the-tech.kz](https://the-tech.kz/populyarnye-e-commerce-kompanii-v-kazahstane-kak-marketplejsy-menyayut-rynok-v-2026-godu/), [bes.media](https://bes.media/news/skolko-nalogov-platyat-marketpleysi-kaspi-wildberries-i-ozon-v-kazahstane/)
- Freedom's marketplace plans: [Digital Business, 28 Oct 2026](https://digitalbusiness.kz/2026-10-28/timur-turlov-anonsiroval-zapusk-marketpleysa-novogo-pokoleniya/), [Forbes.kz on "Freedom Market (ex-Teez)"](https://forbes.kz/articles/prodavtsov-kaspi-zovut-na-freedom-market-ranee-teez-cba910)
- robots.txt read on 17 Nov 2026: halykmarket.kz, alser.kz (mechta.kz answered 403)
