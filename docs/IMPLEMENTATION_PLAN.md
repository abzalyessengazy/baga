# Implementation plan

## Phase 0 — spike + decisions ✅
- [x] Kaspi data access works (offers endpoint + product page data) from a KZ connection
- [x] City pricing tested: national price
- [x] Decisions recorded in DECISIONS.md
- [x] Datacenter IP test: run `collect.yml` once against 3 seed products (passed 1 Nov 2026, GitHub Actions ubuntu-latest: Kaspi page + offers OK; Vercel/AWS gets 429, so the website never fetches Kaspi)

## Phase 1 — foundations ✅
- [x] Monorepo, TypeScript, Vitest, CI workflow
- [x] next-intl `/ru` `/kk`, Accept-Language detection, cookie, switcher keeps path/query/typed link
- [x] i18n parity check
- [x] Connect Vercel project + Supabase project; set env vars (https://baga-rho.vercel.app, Supabase eu-north-1)
- [ ] Sentry + PostHog

## Phase 2 — collector + catalog (in progress)
- [x] Kaspi adapter with fixtures and tests (URL forms, offers, product page)
- [x] Schema + migration, `saveSnapshot` (write on change + daily heartbeat)
- [x] Worker: claim queue, sanity guard, backoff, circuit breaker, healthcheck ping
- [x] Seed script; `discover` builds the seed list from Kaspi's sitemap (visit window only)
- [x] Collector follows kaspi.kz/robots.txt: daily 04:00–08:45 UTC, ≥10 s between requests; visitor requests first
- [ ] Seed list of ~1,000 products across ~15 categories (phones, laptops, TVs, appliances, consoles…): run `discover` in the window, review, `seed`. Size set by the window budget (DECISIONS 2026-11-01)
- [ ] Run unattended 7 days, ≥ 98% success
- [x] Backup restore drill (backup.yml: nightly dump to R2 + automatic restore into scratch Postgres with row-count check; first run passed 1 Nov 2026)

## Phase 3 — product page (in progress)
- [x] Receipt landing page, animated highlights, tear-off coupon
- [x] Product page: price, verdict, history chart (gaps shown), sellers, JSON-LD, sitemap, robots
- [x] `/api/resolve` with URL allowlist + rate limit; `/go/[id]` click tracking
- [x] Cloudflare Turnstile on lookups of unknown products (and short-link resolution); page loads never fetch Kaspi
- [x] Unknown products are queued for the collector; page shows "Добавлен", the name from the link, and similar tracked products
- [x] Catalog search in the paste field (`/api/search`, our database only)
- [ ] Short links from the Kaspi app (`l.kaspi.kz`) verified on production (GET resolver deployed 1 Nov 2026; check the `[resolve]` log)
- [x] Lighthouse mobile ≥ 85 (1 Nov 2026: landing 88–90, product 96–98; a11y, best practices, SEO 100)

## Phase 4 — tracking + alerts
- [x] Tracking before registration: anonymous watcher (cookie + private link), coupon saves the price at once, also on queued products (DECISIONS 2026-11-02)
- [x] Telegram alerts: first price + target reached, bot `/start` link, `/list`, `/stop`
- [x] "Мои товары" page: list, remove; change price on the product page
- [ ] Verify on production: bot set up, first-price message arrives within minutes in the window
- [ ] Registration (Supabase magic link or Telegram login) moves watcher trackings into the account; 5 free, 50 on a 2 999 ₸/month plan
- [x] Email alerts with confirmation (bagaapp.com, Resend; DECISIONS 2026-11-02)
- [ ] Verify on production: confirmation email arrives, first price / target email arrives, one-click unsubscribe works
- [x] Unsubscribe endpoint (one-click), email on/off in "Мои товары"
- [x] Alert state machine + email template + sender (worker)

## Phase 5 — hardening, beta prep
- [x] Privacy policy + terms (ru/kk), feedback button, "Удалить мои данные" (3 Nov 2026)
- [x] "Вы купили?" prompt: Telegram buttons, email answer page, "Мои товары" (3 Nov 2026)
- [ ] Playwright journeys in both locales
- [x] Funnel: in-house events instead of PostHog (DECISIONS 2026-11-03), on the admin page

## Phase 6 — private beta (50–100 testers, 6 weeks)
