# Architecture

```
Shopper ──paste──▶ Web (Next.js, Vercel) ──reads/writes──▶ Supabase Postgres + Auth
                       │ new product: live fetch               ▲
                       ▼                                       │ saves on change
                   Kaspi.kz ◀──scheduled checks── Worker (GitHub Actions / KZ VPS) ──▶ Resend ──▶ inbox
```

## Data acquisition (verified 1 Nov 2026 from a Kazakh home connection)
- Offers: `POST https://kaspi.kz/yml/offer-view/offers/{productId}` with JSON body `{cityId, id, limit, page, sortOption:"PRICE", …}` and header `X-KS-City`. Returns `offers[]` with `merchantId, merchantName, merchantRating, price, deliveryDuration`, plus `total`.
- Product: the product page HTML contains `BACKEND.components.item = {...}` with `card.title`, `galleryImages`, `breadcrumbs`.
- Lowest price was identical in Almaty, Astana, Shymkent, Karaganda, Aktobe, Atyrau for 3 products; 3–5 of ~30 sellers vary by city, never the cheapest.
- Open: whether datacenter IPs (GitHub Actions) are accepted. First `collect.yml` run answers it; fallback is a KZ VPS running the same `pnpm worker`.

## Storage
See `packages/db/migrations/0001_init.sql`. Key ideas: `price_observations` is append-only and written only on change plus a daily heartbeat; `product_state` holds the current snapshot; `collection_schedule` is the queue (claimed with `FOR UPDATE SKIP LOCKED` + `locked_until`); RLS on all user tables.

## Scheduling
Priority → interval: hot (within 10% of a target) 1 h · tracked 3 h · seed/viewed 12 h · cold weekly. Backoff 5/20/60 min. Circuit breaker stops a run after 2× 403/429 or > 20% failures.

## Hosting (free tier first)
Vercel Hobby (web) · Supabase Free (DB + Auth) · GitHub Actions (worker cron, backups) · Resend Free (3k/month) · Cloudflare R2 (backups) · Healthchecks.io, Sentry, PostHog free tiers.
