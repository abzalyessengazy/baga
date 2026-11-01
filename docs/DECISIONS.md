# Decisions

## 2026-11-01 — Kaspi first, low volume
Proceed with Kaspi public data at low volume for validation. No public consumer API exists. Revisit if Kaspi objects; consider asking for a partnership.

## 2026-11-01 — One national price
Tested 3 products across 6 cities: identical lowest price. Store one price per product; collect with Almaty's city id. Dropped `regions` from the schema.

## 2026-11-01 — Legal review (data localization) deferred to Phase 2
Use free/cheap EU-hosted services now (Supabase). Plain Postgres keeps a later move to KZ hosting cheap.

## 2026-11-01 — Stack
Next.js 15 + next-intl, Supabase Postgres via postgres.js (no ORM: SQL migrations are the source of truth), Resend, Node worker run by tsx, Vitest. Fonts self-hosted via Fontsource (Onest, JetBrains Mono) — both cover Kazakh Cyrillic and need no Google Fonts call at build time.

## 2026-11-01 — Number formatting by hand
`Intl` kk-KZ output differs between Node and browsers (hydration mismatch). `formatTenge` groups digits itself.

## 2026-11-01 — Interest capture before accounts
Until Phase 4 (magic-link auth), the coupon form stores `{email, target}` as a `feedback` row of kind `waitlist`, and says alerts are coming soon. No fake "you're tracking" confirmation.

## 2026-11-01 — Verified TLS to Postgres
postgres.js defaults to `ssl: false`, so our Supabase connections were unencrypted. All clients (web, worker, migrate) now build options with `connectionOptions()` from `@baga/db`: Supabase hosts use verified TLS against the Supabase Root 2021 CA (`packages/db/prod-ca-2021.crt`, embedded in `src/supabase-ca.ts` so it works in the Vercel bundle; expires 26 Apr 2031); other remote hosts use verified TLS against system CAs; localhost stays plain; an explicit `sslmode` in the URL wins. "Enforce SSL" is on in the Supabase project.

## 2026-11-01 — Hourly collection on GitHub Actions
The datacenter IP test passed: Kaspi answers GitHub Actions runners. The repo is private, and Actions on the free plan gives 2,000 minutes a month (each run is billed as at least 1 minute), so `collect.yml` runs hourly (`7 * * * *`) instead of every 30 minutes. That's about 1,440 minutes a month at full seed size. The shortest product interval is 60 min (`hot`), so a due product waits at most about one extra hour. If minutes run short, move collection to a small KZ VPS cron (same `pnpm worker`).

## 2026-11-01 — Collection every 4 hours (replaces "Hourly collection on GitHub Actions")
Prices change slowly, so `collect.yml` runs every 4 hours (`7 */4 * * *`, `COLLECT_EVERY_MINUTES = 240`). Actions minutes depend on total checks a day (about 2.5 s each: page + offers + polite delay), not on how often the job runs. Seed interval goes from 12 h to 20 h, so each product gets at least one check per calendar day (a test enforces seed + run spacing ≤ 24 h). Budget: 1,000 seed products ≈ 1,200 checks a day ≈ 1,600 minutes a month, inside the private-repo free 2,000. `COLLECT_BATCH=250`, job timeout 30 min, claim lock 45 min. 2,000 seeds (≈ 3,100 minutes) would need a public repo or a VPS. Hot/tracked intervals (60/180 min) currently mean "every run"; revisit in Phase 4.

## 2026-11-01 — Follow kaspi.kz/robots.txt; daily run in the visit window; public repo (replaces "Collection every 4 hours")
kaspi.kz/robots.txt asks bots for `Crawl-delay: 10` and `Visit-time: 0400-0845` (UTC = 09:00–13:45 Almaty), and lists `Sitemap: https://kaspi.kz/shop/sitemap.xml`. None of the paths we use are disallowed. We follow both directives:
- The worker's Kaspi client waits ≥ 10 s (+ up to 2 s jitter) between any two requests, including re-checks and alert confirmations.
- `collect.yml` starts once a day at 03:50 UTC; the worker waits for 04:00, claims small batches, and stops claiming at 08:45 UTC. Capacity ≈ 1,500 requests/day.
- Routine checks fetch the offers endpoint only (1 request). The product page (title, image, category) is refreshed when older than 7 days (`products.page_checked_at`).
- Seed products wait in `seed_queue`; the seed script makes no Kaspi requests. The collector fetches queued products after due ones.
- Seed interval is 18 h: longer than the 4 h 45 min window (no double check the same day), short enough that a product checked late in today's window is due before tomorrow's opens.
- Heartbeat observation is written when the last observation is on an earlier Almaty calendar day (it was "> 24 h", which left gaps with daily checks).
- Budget: ~1,300 seed products checked daily, plus products people view. Visitor-triggered lookups of unknown products (web) are single on-demand requests, outside these crawl rules, rate-limited separately (Turnstile, Phase 3).
- The repo is public, so GitHub Actions minutes are free; a ~5 h job fits the 6 h job limit. Note: GitHub disables scheduled workflows in public repos after 60 days with no commits.

## 2026-11-01 — Cloudflare Turnstile on visitor-triggered Kaspi requests
A page load never fetches Kaspi. A product page for a product we don't have shows a lookup screen (`noindex`) with an invisible Turnstile check; on success the browser POSTs `{id, token}` to `/api/lookup`, which verifies the token with Cloudflare `siteverify`, fetches the product once, stores it and the page reloads from the database. Short-link resolution in `/api/resolve` (a request to l.kaspi.kz) also requires a token. No npm dependency: the Turnstile script is loaded only where needed and verification is a `fetch`. Keys: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`. Without keys, development uses Cloudflare's documented always-pass test keys; production fails closed (lookups refused). Per-IP and per-instance limits stay as a second layer. Without a database (UI work), the old live-fetch path remains for development only.

## 2026-11-01 — Vercel functions in Stockholm (arn1)
The database is in Supabase eu-north-1 (Stockholm). Server code ran in Vercel's default iad1 (US East), so every query crossed the Atlantic (first product page ~3.3 s). `apps/web/vercel.json` pins functions to `arn1`, in the repo rather than only in the dashboard.

## 2026-11-01 — The website never requests Kaspi; visitor lookups are queued (replaces the on-demand fetch in "Cloudflare Turnstile on visitor-triggered Kaspi requests")
Kaspi answered the very first request from Vercel (AWS, iad1 and arn1) with 429, while GitHub Actions runners are answered normally. Rule 6 says stop on 429, so the web app no longer fetches products. After the Turnstile check, `/api/lookup` adds the product to `seed_queue` with `source = 'visitor'` (capped at 300 pending visitor rows). The daily collector, inside the robots.txt window with the 10 s delay, takes visitor rows first on every batch, then due products, then seed rows, and polls for new visitor rows every minute until the window closes, so a request made during the window is fetched within minutes. The product page shows when the price will appear (today/tomorrow, 9:00–13:45 Almaty). A product Kaspi reports as missing is kept in the queue as `not_found` so it is not requested again daily, and its page says so. Short-link resolution (`/api/resolve`, one request to l.kaspi.kz) stays on demand; if Kaspi refuses it, the visitor is asked to paste the full link. Every request to Kaspi product data now goes through the collector.

## 2026-11-01 — Nightly backup to Cloudflare R2 with an automatic restore drill
Supabase Free has no backups. `backup.yml` runs at 02:17 Almaty: `pg_dump --schema=public` over the session pooler (port 5432; `pg_dump` cannot use the transaction pooler), with a client matching the server's major version from the PostgreSQL apt repo, uploads to a private R2 bucket (free tier, 10 GB; old dumps expire by an R2 lifecycle rule), then restores the dump into a scratch Postgres of the same version and fails unless every table's row count matches. Supabase's `auth.users`/`auth.uid()` are stubbed for the drill; once Phase 4 creates user accounts, the backup must also cover `auth.users`. The derived connection string and password are masked in the public Actions logs.

## 2026-11-01 — Inline CSS (Next `experimental.inlineCss`)
Lighthouse mobile showed the 6 KB stylesheet as render-blocking (≈900 ms on a simulated slow phone). The CSS is small, so it is inlined into each HTML response; the text (the LCP element) can paint without waiting for a second request. Revert if the CSS grows past ~30 KB or the flag causes issues.

## 2026-11-01 — Seed catalog from Kaspi's sitemap, about 1,000 products
The catalog is seeded up front so search and "similar products" have something to show. Source: the sitemap kaspi.kz/robots.txt lists (`/shop/sitemap.xml`); `pnpm --filter @baga/worker discover` reads the index and a few product sitemaps (≤8 requests, ≥10 s apart, visit window only, stops on 403/429), sorts products into ~15 categories by the words of their links (accessories skipped), takes an even spread per category and writes `apps/worker/data/seed-discovered.txt` for review; the existing `seed` command queues it. No database access, no category or search APIs. Size: the window allows ~1,500 requests a day; a new product costs 2, a seed product ~1.15 a day after that, so ~1,000–1,200 products fit with room for visitors (the plan's 2,000 does not). The first fill takes about two days. The sitemap has no popularity; the per-category spread is a first cut to refine once the real files are seen.
