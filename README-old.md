# Чек — Kaspi.kz Price Watch

Track a Kaspi.kz product's price over time and get alerted when it changes.
No login, no full-catalog crawling — you submit a product URL, the system
checks it once a day, and notifies you (or a buyer/seller you're serving)
by Telegram or email when the price moves.

This is the "simple, price-only" MVP described in the accompanying research:
a lightweight alternative to full sales-estimation tools like PriceFeed/
AlgaTop/SkyMetric, built around the one signal Kaspi's public product pages
expose reliably — price.

## How it works

Kaspi product pages carry standard Open Graph `product:*` meta tags
(`product:price:amount`, `product:price:currency`, `product:availability`),
server-rendered without needing JavaScript — the same data Kaspi hands to
Google/Facebook for link previews. The scraper (`backend/app/scraper.py`)
reads exactly that, once a day, per product — no headless browser, no
category crawling, no seller-cabinet login. That keeps the whole system's
footprint small and keeps it entirely outside Kaspi's seller-cabinet rules
(which govern *cabinet* access, not public product pages).

```
┌─────────────┐      daily cron       ┌──────────────┐
│  Next.js UI  │ ───────────────────▶ │   FastAPI     │
│ (receipt-    │ ◀─────────────────── │   backend     │
│  themed)     │      REST/JSON       │               │
└─────────────┘                       └──────┬────────┘
                                              │
                        ┌─────────────────────┼─────────────────────┐
                        ▼                     ▼                     ▼
                 Postgres/SQLite      scraper.py (1 req/     Telegram / SMTP
                 (products, price     ~3s, honest UA,        (price-change
                 history, watches)    retries + backoff)     alerts)
```

## Quickstart (local dev, no Docker)

**Backend**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # defaults to SQLite, good enough to start
uvicorn app.main:app --reload
# API docs at http://localhost:8000/docs
```

**Frontend** (separate terminal)
```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
# UI at http://localhost:3000
```

Open `http://localhost:3000`, paste a Kaspi product URL
(`https://kaspi.kz/shop/p/.../`), and it'll fetch the current price
immediately and start tracking it.

## Quickstart (Docker Compose — closer to production)

```bash
cp backend/.env.example backend/.env   # fill in Telegram/SMTP if you have them
docker compose up --build
```
This runs Postgres + the FastAPI backend + the Next.js frontend together.
Frontend on :3000, API on :8000.

## Running the tests

```bash
cd backend
pip install -r requirements.txt
python -m pytest tests/ -v
```
10 tests cover HTML parsing against real Kaspi page structure, the full
add-product → create-alert → price-changes → notification-fires pipeline,
and error handling for blocked/failed requests.

## Setting up alerts

**Telegram**
1. Message [@BotFather](https://t.me/BotFather) on Telegram, run `/newbot`,
   copy the token into `TELEGRAM_BOT_TOKEN` in `backend/.env`.
2. A user needs their numeric chat ID to receive alerts. The simplest way:
   have them message your bot once, then call
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `message.chat.id`
   from the response. (A proper `/start` command handler that replies with
   the user's own chat ID is the natural v2 improvement here — not built
   yet, see Roadmap.)

**Email**
Fill in `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` /
`SMTP_FROM` in `backend/.env` with any SMTP provider (SendGrid, Mailgun,
Yandex, etc).

## Important: things to sort out before going live

**This was built and tested in a sandboxed environment with no network
access to kaspi.kz.** Everything here is verified against:
- The actual HTML structure of a real, live Kaspi product page (fetched
  and inspected during development — the meta tags this parses are real).
- A full request/response cycle through a local mock server standing in
  for kaspi.kz, proving the add-product → track → detect-price-change →
  notify pipeline genuinely works end to end.

What it has **not** been tested against is the real kaspi.kz under normal
operating conditions. One data point from development: a request to the
live site from the build sandbox got back an **HTTP 403**. That doesn't
mean the scraper logic is wrong (it isn't — the parser is correct against
real Kaspi markup), but it does mean Kaspi applies some kind of bot
filtering, likely based on request headers, TLS/HTTP fingerprint, or
datacenter IP reputation. Before relying on this in production:

- Test `POST /api/products` against a handful of real Kaspi URLs from
  wherever you actually deploy, and watch the response.
- If you get blocked, the usual fixes, in order of how invasive they are:
  more browser-realistic headers (`Accept`, `Sec-Fetch-*`), a residential
  or KZ-based IP/proxy rather than a generic cloud datacenter IP, and only
  as a last resort rendering via a real browser (Playwright) instead of a
  plain HTTP request — which would lose the "no headless browser needed"
  simplicity that makes this cheap to run.
- Keep `MIN_SECONDS_BETWEEN_REQUESTS` conservative. The current default
  (3s, plus this being a once-a-day-per-product job rather than continuous
  polling) is deliberately gentle — loosening it trades reliability for
  speed you probably don't need for a daily-refresh product.

**Legal**: this design was chosen specifically to avoid Kaspi's seller
rule against sharing seller-cabinet access with third parties — it only
ever touches public product pages, never a cabinet login. That's a much
safer posture than the repricing bots in the competitive research, but it
isn't a legal guarantee. Have a Kazakhstan lawyer glance at Kaspi's current
terms before a public launch, and register as an Astana Hub resident early
if pricing aggressively is part of the plan (see the earlier research doc
for the tax mechanics).

## Roadmap (not built yet)

- **Telegram bot `/start` flow** to self-serve chat IDs instead of manual
  `getUpdates` lookup.
- **Category/niche browsing** — today this is watchlist-only (you must
  supply a product URL). Kaspi's category pages aren't server-rendered the
  way product pages are, so this needs either their search endpoint
  (unconfirmed) or headless rendering — a deliberate v2 scope cut, not an
  oversight.
- **Seller-side view**: group watches by "your products vs. competitors'"
  and layer in the review/rank-based sales-estimation approach from the
  research once there's a real user base to calibrate estimates against.
- **Wildberries/Ozon** as additional tracked marketplaces, once this is
  proven on Kaspi — see the earlier comparative research for why that
  order matters.
- **Auth** — the no-login watch-token model is intentionally minimal for
  an MVP; a real account system is worth adding once there's retention to
  protect.

## Project layout

```
backend/
  app/
    main.py          FastAPI app, CORS, startup/shutdown
    config.py         Settings from environment variables
    models.py          Product, PriceSnapshot, Watch, NotificationLog
    schemas.py          Pydantic request/response shapes
    scraper.py           Kaspi product-page fetch + parse (+ rate limiter)
    scheduler.py          Daily refresh job + change detection
    notifications.py       Telegram / email senders
    routers/
      products.py           add/list/get/refresh product endpoints
      watch.py                create/list/delete alert endpoints
  tests/                       10 tests, see above
frontend/
  app/                          Next.js App Router pages
  components/                    AddProductForm, PriceChart, AlertForm, ...
  lib/api.ts                      Typed API client
docker-compose.yml                 Postgres + backend + frontend
```
