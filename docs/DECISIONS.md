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
