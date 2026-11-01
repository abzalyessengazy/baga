# Product spec — BAGA MVP

Full plan: https://claude.ai/artifact/PtKqWX6rroymHPbYbnCQbv

## Promise
"Не покупайте слишком рано." Paste a Kaspi link (or search what BAGA tracks) → see observed price history, every seller, a descriptive verdict → tear off the coupon to get an email when your price arrives.

## Scope (MVP)
- Kaspi.kz only. One national price (verified across 6 cities on 1 Nov 2026; reference city id 750000000).
- Product page works without an account: price, verdict, history chart, sellers, "observed since".
- A product BAGA doesn't track yet is added on the visitor's request and gets its first price in the collector's next daily window ("сегодня"/"завтра"; no times shown). Until then: the name from the visitor's link, a link to Kaspi, and similar tracked products. Nothing is estimated.
- Tracking = target price + email (magic link). One alert type: target reached. Email only. Telegram is v1.1.
- RU/KK interface, no English. Language switch keeps path, query and the typed link.
- Excluded: predictions, payments, ads, other marketplaces, mobile apps.

## Verdict rules (`packages/core/src/verdict.ts`)
- < 14 observed days → "Мало данных / Дерек аз", show the observed minimum.
- Window: last 60 observed days. ≤ P20 → low; > P70 → high; else typical.
- Never "the price will drop".

## Alert rules (`packages/core/src/alerts.ts`)
- Fire when the lowest price ≤ target, after one confirming re-fetch.
- One alert per dip. Re-arm only after 24 h above target × 1.03. Minimum 72 h between alerts.
- Idempotency key `trackingId:episode` is unique in the DB.

## Copy rules
Plain verbs, sentence case, no exclamation marks. Errors say what happened and what to do. Prices: `749 364 ₸`.
