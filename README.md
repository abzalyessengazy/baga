# BAGA

Paste a Kaspi.kz product link and see whether today's price is a good one: observed price history, every seller's offer, a plain-language verdict, and an email when the price reaches your target. Russian and Kazakh.

## Run locally
```bash
pnpm install
BAGA_FIXTURES=1 pnpm dev        # http://localhost:3000/ru, product demo at /ru/p/177318181
pnpm test && pnpm typecheck && pnpm i18n:check
```
With `BAGA_FIXTURES=1` the product page uses real Kaspi responses captured on 1 Nov 2026, so no database or network is needed.

## Run against real data
1. Create a free Supabase project, copy `.env.example` to `.env`, fill `DATABASE_URL`.
2. `pnpm db:migrate`
3. `pnpm --filter @baga/worker seed` (queues `apps/worker/data/seed-products.txt` for collection; no Kaspi requests)
4. `pnpm worker` (one collection run; runs daily 04:00–08:45 UTC per kaspi.kz/robots.txt, from `.github/workflows/collect.yml`)
5. `pnpm dev`

## Layout
`apps/web` site · `apps/worker` collector · `packages/core` logic · `packages/kaspi` Kaspi adapter · `packages/db` schema + queries · `docs/` plan and decisions. See `CLAUDE.md` for the rules.
