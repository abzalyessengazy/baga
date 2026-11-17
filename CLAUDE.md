# BAGA — rules for Claude Code

BAGA shows Kaspi.kz price history, the cheapest sellers, a descriptive verdict, and emails users when a target price is reached.
Read `docs/IMPLEMENTATION_PLAN.md` first: work only on the current milestone.

## Stack
- pnpm monorepo, TypeScript everywhere, Node 22.
- `apps/web` Next.js 15 App Router + next-intl (`/ru`, `/kk`). Hosted on Vercel.
- `apps/worker` price collector + alert sender (`pnpm worker`). Runs from GitHub Actions cron or a KZ VPS.
- `packages/core` pure logic: money, verdict, alert state machine, scheduling. No I/O.
- `packages/kaspi` URL parser, Kaspi client, response parsers + `fixtures/`.
- `packages/db` SQL migrations (`migrations/*.sql`) + typed queries (postgres.js). Supabase Postgres.

## Commands
- `pnpm dev` (web on :3000; `BAGA_FIXTURES=1` serves captured Kaspi data, no network/DB needed)
- `pnpm test` · `pnpm typecheck` · `pnpm i18n:check` · `pnpm build`
- `pnpm worker` (needs `DATABASE_URL`) · `pnpm --filter @baga/worker discover` (visit window only; `--from-file` re-picks offline) · `pnpm --filter @baga/worker seed [file]` · `pnpm --filter @baga/worker report --dry` (the owner's daily report, read-only) · `pnpm db:migrate`
- Build checks while the user may have `pnpm dev` running: `BAGA_DIST_DIR=.next-check pnpm build` (never delete `apps/web/.next`).

## Hard rules
1. **No user-facing string in code.** Every visible word lives in `apps/web/messages/{ru,kk}.json`; both files always have the same keys (`pnpm i18n:check`). No English in the UI. Brand/model names from Kaspi are shown as-is.
2. **Never fabricate prices or history.** Only observed prices are stored and shown; gaps stay gaps. The landing page sample is stamped ОБРАЗЕЦ/ҮЛГІ. The verdict describes the past and never predicts.
3. **Money is integer tenge** (`number`, `int4`). Format with `formatTenge`.
4. **One shared history per product.** Users own trackings, never prices.
5. **Every DB change is a new file in `packages/db/migrations/`.** Never edit an applied migration.
6. **Be polite to Kaspi — follow kaspi.kz/robots.txt:** ≥10 s between requests (robots.txt's Crawl-delay; a 5 s stress test on 14–15 Nov 2026 ended on its first 403/429, DECISIONS 2026-11-15), collect only 04:00–08:45 UTC (Visit-time), only seeded/viewed/tracked products (one nobody tracks under 50 000 ₸ only when a person opens it again: `AUTO_MIN_PRICE`, the owner, 15 Nov 2026), stop on 403/429 (circuit breaker). Never fetch a user-supplied URL; derive the product id and build the Kaspi URL ourselves (only exception: one non-following GET of `https://l.kaspi.kz` + a validated short-link path, after Turnstile — by the website with a 4 s timeout, else queued in `short_link_queue` for the collector; variant links `…-<digits><letter>/` are queued too and the collector resolves them with one non-following GET of `https://kaspi.kz/shop/p/-<code>/`). The website never requests Kaspi product data: unknown products go to `seed_queue` for the collector. **Manual checks** (DECISIONS 2026-11-09, 2026-11-17, the owner's decisions): a product a visitor brought and we never checked, on that visitor's request after Turnstile, outside the collector's minutes (not 03:55–08:50 UTC), at most 40 a day in all and 3 per visitor, run by `pnpm worker --manual` on GitHub, which sends **no Kaspi request**: MarketParser (paid data provider, API v2) checks the card by its product number and we store what it saw, marked `source = 'marketparser'`, only when the result is exactly that card; anything else, and a queued link we cannot turn into a product number, waits for the collector's window. Never evade a Kaspi block (no proxies, other networks, browser impersonation).
6a. **Be polite to every other store too** (DECISIONS 2026-11-07 Technodom, 2026-11-14 Sulpak): follow its robots.txt (Disallow, and Crawl-delay / Visit-time where set); at least 10 s between requests even when it sets none; one request at a time, never in parallel with a Kaspi request; only product pages of exactly matched products plus its sitemaps (a store with no product sitemap, Sulpak: also the category listings of categories we hold, each re-read at most weekly); the same honest User-Agent; stop on 403/429 with that store's own circuit breaker. Never fetch a user-supplied URL, never evade a block, never log in, use cookies, promo codes or a browser imitation. Show only observed prices with their check time; never subtract bonuses or guess promo prices.
7. **Kaspi prices are national for most goods** (verified 1 Nov 2026): history, verdict and alerts use the reference city id 750000000 (Almaty). Only goods in the city-dependent categories of `packages/core/src/cities.ts` (pharmacy, baby care; 10 Nov 2026 probe, DECISIONS 2026-11-10) also get one sellers request per other city (Astana, Shymkent, Atyrau) at most once in 20 h, stored in `city_prices`. Add a category there only after a probe shows it differs by city.
8. New dependency or architectural change → add an entry to `docs/DECISIONS.md` first.
9. Core logic changes come with tests. Parser changes come with refreshed fixtures.

## Definition of done
Tests, typecheck, i18n check and build pass; both locales checked at 390px and 1440px; acceptance criteria of the milestone met; checkboxes ticked in `docs/IMPLEMENTATION_PLAN.md`.

## Design language
A thermal receipt on a steel counter. Receipt type: JetBrains Mono (IBM Plex Mono tried and reverted 14 Nov 2026 at the owner's request; JetBrains Mono lacks ₸ and ә ғ қ ң ұ һ, which fall back). UI type: Onest; long product names in the home lists are set in Onest too (16 Nov 2026, the owner's go). One accent: stamp violet `#5b47e0` (the brand book's, since 14 Nov 2026; drops, links, stamps); stamp red `#c23b2c` only for "high price", price rises and the sale-days strip; caution amber (`--caution`) only for "check this seller" signals (low Kaspi rating, a price far below the others); Kaspi red (`--kaspi`) only for the «Открыть на Kaspi» button; another store's brand colour (`--technodom`, `--sulpak`, `--halyk`) only for its name chip, never its logo artwork. Interactions: the tear-off coupon = "track this price". Tokens live in `apps/web/src/app/globals.css`.
