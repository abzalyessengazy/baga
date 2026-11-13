# Architecture

```
Shopper ──paste link / search──▶ Web (Next.js, Vercel arn1) ──reads/writes──▶ Supabase Postgres (eu-north-1)
             unknown product: Turnstile → seed_queue (no Kaspi request)       ▲              │
                                                                              │ saves on change   │ nightly pg_dump
Kaspi.kz ◀── daily, 04:00–08:45 UTC, ≥10 s apart ── Worker (GitHub Actions) ──┘              ▼
                                                        └──▶ Telegram bot ──▶ visitor     Cloudflare R2
```

## Data acquisition (verified 1 Nov 2026)
- **Offers:** `POST https://kaspi.kz/yml/offer-view/offers/{productId}`.
  - Request: JSON body `{cityId, id, limit, page, sortOption:"PRICE", …}` and the header `X-KS-City`.
  - Response: `offers[]` with `merchantId, merchantName, merchantRating, price, deliveryDuration`, plus `total`.
- **Product:** the product page HTML contains `BACKEND.components.item = {...}`, with `card.title`, `galleryImages` and `breadcrumbs`.
- **Seed catalog:** comes from Kaspi's sitemap (`/shop/sitemap.xml`, the one robots.txt lists), via the `discover` command. The index lists 350 product sitemaps and 320 per-city category sitemaps, hosted in one dated folder on Kaspi's CDN (`resources.cdn-kaspi.kz/img/cnt/s/m/<date>/`). Only that folder is fetched there, with the same 10 s spacing.
- **Short links:** `l.kaspi.kz/…` links are resolved with one GET that doesn't follow the redirect, after Turnstile.
- **Prices are national for most goods:** the lowest price was identical in 6 cities for 3 products. We use reference city 750000000 (Almaty). Pharmacy and baby care are sold by local shops (10 Nov probe): for those the collector also stores Astana, Shymkent and Atyrau sellers once a day in `city_prices`, and the product page has a city picker (DECISIONS 2026-11-10). Known gap (13 Nov): the price is national but the seller list is not always: a shop may sell only in some cities, so a lowest price that rests on one Almaty seller may not be on offer elsewhere (DECISIONS 2026-11-13 "Seller lists differ by city").
- **Which networks Kaspi accepts:**
  - Answers normally: a Kazakh home connection and GitHub Actions.
  - Answers with 429: Vercel (AWS).

  That's why the website never fetches Kaspi product data, and the only Kaspi request it makes is resolving a visitor's short link. Kaspi blocks aren't evaded.

## Kaspi politeness (kaspi.kz/robots.txt)
- **Request spacing:** `Crawl-delay: 10`. The worker's client spaces every request by 10 s + up to 2 s of jitter.
- **Visit window:** `Visit-time: 0400-0845` UTC. `collect.yml` starts at 03:50 UTC, the worker waits for 04:00 and stops at 08:45, and `discover` and `probe` refuse outside the window.
- **Budget:** about 1,500 requests a day.
- **Manual checks** (DECISIONS 2026-11-09): a visitor's own new product, on request, outside 03:55–08:50 UTC, via `manual.yml` (`pnpm worker --manual`), at most 40 a day and 3 per visitor, paused 7 days by a 403/429. A queued link (clothes and shoes from the phone) gets one too: the run finds its product number first.
  - A new product costs 2 requests: the page and the offers.
  - A routine check costs 1 request (offers only). The product page is refreshed weekly.
  - So the catalog is sized at about 1,000–1,200 products.
- **Circuit breaker:** the run stops after 2 responses with 403/429, or when more than 20% of at least 10 checks fail.

## Storage
See `packages/db/migrations/`, starting with `0001_init.sql`.
- **`price_observations`:** append-only. Written only when the price changes, plus a heartbeat once per Almaty calendar day.
- **`product_state`:** the current snapshot of each product.
- **`collection_schedule`:** the work queue, claimed with `FOR UPDATE SKIP LOCKED` + `locked_until`.
- **`seed_queue`:** products not collected yet.
  - `source`: `seed`, or `visitor` for visitor requests, which are fetched first.
  - `status`: `pending` or `not_found`.
  - The slug from the visitor's link is kept so the page can show the product's name before it's collected.
- **`watchers`, `trackings`:** a tracking belongs to a registered user or to an anonymous watcher. A watcher's tracking may wait for its product (`external_id` set, `product_id` filled in when first collected).
- **RLS:** enabled on all tables. Users own trackings, never prices.

## Scheduling (`packages/core/src/schedule.ts`)
Priority → check interval:

| Priority | Interval | Applies to |
|---|---|---|
| hot | 1 h | active tracking within 10% of its target |
| tracked | 3 h | active tracking |
| seed | 18 h | seed products, and products viewed in the last 14 days. This is about once a day, since the window is 4 h 45 min. |
| cold | 7 days | everything else |

After a failed check, the retry backoff is 5, 20, then 60 minutes.

## Website
- **Next.js 15 App Router with next-intl:** `/ru` and `/kk`.
- **Hosting:** Vercel Hobby, functions pinned to `arn1` next to the database.
- **Search:** `/api/search` reads our catalog only.
- **Lookups and short links:** `/api/lookup` queues unknown products and `/api/resolve` turns pasted links into product ids. Both are rate-limited and checked with Turnstile.
- **Tracking before registration:** `/api/track` saves a visitor's price for a product in the catalog or the queue. The visitor is an anonymous watcher: a secret in an httpOnly cookie and in a private link, stored hashed. `/my` lists what they track.
- **Telegram:** `/api/telegram/webhook` handles the bot (`/start <code>` connects a chat, `/list`, `/stop`). The collector sends the first price and target alerts right after each check.
- **CSS** is inlined into the HTML. Lighthouse mobile scores are 88–98.

## Hosting (free tier)
- **In use:**
  - Vercel Hobby (web)
  - Supabase Free (DB, Auth in Phase 4)
  - GitHub Actions (collector, CI, backups)
  - Cloudflare Turnstile and R2 (backups, 30 days kept)
- **Planned:** Resend Free for alerts, plus Healthchecks.io, Sentry and PostHog.
