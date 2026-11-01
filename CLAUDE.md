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
- `pnpm worker` (needs `DATABASE_URL`) · `pnpm --filter @baga/worker seed` · `pnpm db:migrate`

## Hard rules
1. **No user-facing string in code.** Every visible word lives in `apps/web/messages/{ru,kk}.json`; both files always have the same keys (`pnpm i18n:check`). No English in the UI. Brand/model names from Kaspi are shown as-is.
2. **Never fabricate prices or history.** Only observed prices are stored and shown; gaps stay gaps. The landing page sample is stamped ОБРАЗЕЦ/ҮЛГІ. The verdict describes the past and never predicts.
3. **Money is integer tenge** (`number`, `int4`). Format with `formatTenge`.
4. **One shared history per product.** Users own trackings, never prices.
5. **Every DB change is a new file in `packages/db/migrations/`.** Never edit an applied migration.
6. **Be polite to Kaspi — follow kaspi.kz/robots.txt:** ≥10 s between requests (Crawl-delay), collect only 04:00–08:45 UTC (Visit-time), only seeded/viewed/tracked products, stop on 403/429 (circuit breaker). Never fetch a user-supplied URL; derive the product id and build the Kaspi URL ourselves.
7. **Kaspi prices are national** (verified 1 Nov 2026). Collect with the reference city id 750000000 only.
8. New dependency or architectural change → add an entry to `docs/DECISIONS.md` first.
9. Core logic changes come with tests. Parser changes come with refreshed fixtures.

## Definition of done
Tests, typecheck, i18n check and build pass; both locales checked at 390px and 1440px; acceptance criteria of the milestone met; checkboxes ticked in `docs/IMPLEMENTATION_PLAN.md`.

## Design language
A thermal receipt on a steel counter. Receipt type: JetBrains Mono. UI type: Onest. One accent: stamp violet `#4b3fd1`; red only for "high price". Interactions: the tear-off coupon = "track this price". Tokens live in `apps/web/src/app/globals.css`.
