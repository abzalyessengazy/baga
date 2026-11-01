# Implementation plan

## Phase 0 — spike + decisions ✅
- [x] Kaspi data access works (offers endpoint + product page data) from a KZ connection
- [x] City pricing tested: national price
- [x] Decisions recorded in DECISIONS.md
- [x] Datacenter IP test: run `collect.yml` once against 3 seed products (passed 1 Nov 2026, GitHub Actions ubuntu-latest: Kaspi page + offers OK)

## Phase 1 — foundations ✅
- [x] Monorepo, TypeScript, Vitest, CI workflow
- [x] next-intl `/ru` `/kk`, Accept-Language detection, cookie, switcher keeps path/query/typed link
- [x] i18n parity check
- [ ] Connect Vercel project + Supabase project; set env vars
- [ ] Sentry + PostHog

## Phase 2 — collector + catalog (in progress)
- [x] Kaspi adapter with fixtures and tests (URL forms, offers, product page)
- [x] Schema + migration, `saveSnapshot` (write on change + daily heartbeat)
- [x] Worker: claim queue, sanity guard, backoff, circuit breaker, healthcheck ping
- [x] Seed script
- [ ] Seed list of 1,000–2,000 popular products (phones, laptops, TVs, appliances, consoles)
- [ ] Run unattended 7 days, ≥ 98% success
- [ ] Backup restore drill

## Phase 3 — product page (in progress)
- [x] Receipt landing page, animated highlights, tear-off coupon
- [x] Product page: price, verdict, history chart (gaps shown), sellers, JSON-LD, sitemap, robots
- [x] `/api/resolve` with URL allowlist + rate limit; `/go/[id]` click tracking
- [x] Cloudflare Turnstile on lookups of unknown products (and short-link resolution); page loads never fetch Kaspi
- [ ] Lighthouse mobile ≥ 85

## Phase 4 — tracking + alerts
- [ ] Supabase magic-link auth (Resend SMTP), `profiles`
- [ ] Coupon form creates a pending tracking → active on email confirm
- [ ] "Мои товары" page: edit target, pause, delete
- [ ] Unsubscribe endpoint, preferences
- [x] Alert state machine + email template + sender (worker)

## Phase 5 — hardening, beta prep
- [ ] Privacy policy + terms (ru/kk), feedback button, "Вы купили?" prompt
- [ ] Playwright journeys in both locales
- [ ] PostHog funnel

## Phase 6 — private beta (50–100 testers, 6 weeks)
