# BAGA

Paste a Kaspi.kz product link, or search the products BAGA already tracks, and see whether today's price is a good one: observed price history, every seller's offer and a plain-language verdict. Email alerts when the price reaches your target are coming in Phase 4. The interface is in Russian and Kazakh.

Live: https://baga-rho.vercel.app/ru · Repo: https://github.com/abzalyessengazy/baga

## How it works
- **Collector** (`apps/worker`, GitHub Actions, daily): fetches Kaspi prices only inside the window kaspi.kz/robots.txt sets (04:00–08:45 UTC = 09:00–13:45 Almaty), with at least 10 s between requests.
  - It saves a price only when it changes, plus one confirming observation a day. Gaps stay gaps.
  - It stops when Kaspi answers 403 or 429.
- **Website** (`apps/web`, Vercel): reads only our database. It never requests Kaspi product data, because Kaspi refuses requests from Vercel's servers.
  - A product we don't track yet is queued after a bot check (Cloudflare Turnstile). The collector fetches it first in its next window.
  - Until then, the page says "Добавлен" and shows similar products we already track.
- **Backups** (GitHub Actions, nightly): dump the database to Cloudflare R2, then restore the dump into a scratch database and compare row counts.

## Run locally
```bash
pnpm install
BAGA_FIXTURES=1 pnpm dev        # http://localhost:3000/ru, product demo at /ru/p/177318181
pnpm test && pnpm typecheck && pnpm i18n:check
BAGA_DIST_DIR=.next-check pnpm build   # build check that does not disturb a running `pnpm dev`
```
- **With `BAGA_FIXTURES=1`**, the product page uses real Kaspi responses captured on 1 Nov 2026, so no database or network is needed.
- **Environment files** (both gitignored):
  - `.env` at the root, for the worker and migrations.
  - `apps/web/.env.local`, for the website.

  See `.env.example` for every variable.

## Run against real data
1. Create a free Supabase project, copy `.env.example` to `.env`, and fill in `DATABASE_URL` (transaction pooler, port 6543).
2. `pnpm db:migrate`
3. Seed the catalog. Neither step writes Kaspi data directly; the collector fetches everything later.
   - `pnpm --filter @baga/worker discover` reads Kaspi's sitemap inside the visit window and writes `apps/worker/data/seed-discovered.txt`. Review that file first.
   - `pnpm --filter @baga/worker seed data/seed-discovered.txt` queues it. With no argument, `seed` queues `apps/worker/data/seed-products.txt` instead.
4. `pnpm worker` runs one collection. Outside the visit window it exits without requests. In production it runs daily from `.github/workflows/collect.yml`.
5. `pnpm dev`

## Workflows
`.github/workflows/`:
- `ci.yml` runs the tests, typecheck, i18n check and build.
- `collect.yml` runs the collector daily at 03:50 UTC. It waits for the window to open.
- `backup.yml` runs at 02:17 Almaty. It needs the secrets `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`, and skips with a warning without them.

## Layout
- `apps/web`: the site
- `apps/worker`: the collector and alert sender
- `packages/core`: pure logic
- `packages/kaspi`: the Kaspi adapter and fixtures
- `packages/db`: migrations and queries
- `docs/`:
  - `PRODUCT_SPEC`
  - `ARCHITECTURE`
  - `IMPLEMENTATION_PLAN` (what's done and what's next)
  - `DECISIONS` (why)

The rules are in `CLAUDE.md`.
