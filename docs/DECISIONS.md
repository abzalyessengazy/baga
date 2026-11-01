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
