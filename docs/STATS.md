# How BAĞA counts prices

Every number on the site comes from prices the collector observed on Kaspi.kz. Nothing is estimated. This file
is the rulebook; the code points here, and a new number on the site needs a rule here first.

## Building blocks

**Observation.** A row in `price_observations`: the lowest in-stock price of a product at one check. A row is
written when the price, seller count or stock changed, and at least once per Almaty day (heartbeat), so every
day a product was checked has at least one row.

**Daily low.** The lowest observed price of a product on one Almaty calendar day (`Asia/Almaty`). All price
comparisons use daily lows, never single observations, so a price that moved up and down within one day counts once.

```sql
select product_id, (observed_at at time zone 'Asia/Almaty')::date as day, min(min_price) as p
from price_observations where min_price is not null group by 1, 2
```

**Shift.** The day the home page shows. During Kaspi's Visit-time (09:00–13:45 Almaty), once `LIVE_MIN_CHECKED`
(300) products were checked today, it is **today, live** (owner, 12 Nov 2026: visitors saw yesterday until 14:00):
the receipt says «12 ноя · идёт проверка · на 12:48» and the numbers grow until the run ends (`liveShiftDay`,
`packages/core/src/window.ts`). Otherwise it is the latest **complete** Almaty day with checks (`lastCompleteShiftDay`):
today after 13:45, yesterday before; before 09:00 the receipt adds «сегодня проверка с 09:00», and during the run's
first ~300 checks «сегодняшняя проверка уже идёт». Products checked on the shift = active products with a price
observation that day (each check writes at least the daily heartbeat). One collector run a day, 09:05–13:42 Almaty.
`/api/stats` and `/api/market` are cached by the CDN for up to an hour but never past 13:45 Almaty, and for 5 minutes
during Visit-time.

**Catalog first.** "Kaspi сегодня" leads with the whole catalog (priced active products, sellers in current offers,
days since the first observation); the shift's changes are one line under it.

**Change.** Two prices differ by `MOVE_MIN_PCT` (1%) of the earlier one or more (`packages/core/src/moves.ts`,
`moveDirection`). Smaller differences are "no change": sellers nudge prices by a few tenge all the time.

## Rule D: the shift against the previous day (`dayMoves`, `packages/db/src/movers.ts`)

For each active product with a daily low on the shift: compare it with the product's daily low of the day before.
A product not seen in stock the day before is not compared (8 Nov 2026: a TV checked on 6 and 8 Nov showed a two-day
change as today's drop; such a change cannot be dated, so it appears only in the week lists, rule W).

- **Checked**: active products with a check on the shift day (in stock or not).
- **Compared**: of those, products with a daily low on the shift and on the day before.
- **Cheaper / dearer**: compared products whose change is a Change down / up. **Same** = compared − cheaper − dearer.
- **Live day** (`liveDayMoves`): each product checked today and in stock now, at its **current** lowest price (what its
  page shows) against its daily low of yesterday (its chart's last point), so a product listed as cheaper can never show
  a higher price on its page. Checked so far 845, compared 786 at 12:47 on 12 Nov; 24 of 24 listed rows matched their pages.

Used by: "Kaspi сегодня" (checked, ↓, ↑, compared), the Z-report totals (checked in the shift, price changed,
of them cheaper) and the Z-report "День" lists (biggest percent first).

## Rule W: now against the previous 7 days (`weekMovers`, `packages/db/src/movers.ts`)

The product's current lowest price (`product_state.current_min_price`, in stock, checked on the shift or the day
before) against its price **a week ago**: its earliest daily low 2–7 Almaty days before today that held two days in
a row (equal within 1% to the observed day before or after it), so a one-day blip is never the reference.

- **Drop**: current price at least `MOVE_MIN_PCT` below the price a week ago.
- **Rise**: current price at least `MOVE_MIN_PCT` above it.

Until 11 Nov 2026 the reference was the week's highest (drops) or lowest (rises) daily low, so a one-day blip that
came back showed as a move (owner, 11 Nov: FreeBuds SE 3 at 14 490 ₸ all week with one day at 17 889 ₸ showed −19%).
Biggest percent first.

Used by: `/drops`, `/explore` drops and rises, the Z-report "Неделя" lists, "Подешевел сильнее всех за неделю" (the
first drop) and the Telegram channel (which posts only drops of 5% or more, its own bar for a post worth sending).

Day lists ("День"): a product whose later check has undone its move is not listed (`stillMoving`); the day's counts
keep every move.

## Find of the day (`packages/core/src/pick.ts`)

One of the week's best drops (rule W), a different one each day: the best 5 eligible drops in turn. Never a product
the home page already shows (the week's biggest drop and the 4 visible rows of the day list), only drops of 10% or
more on products from 5 000 ₸, not a product whose cheapest offer needs a seller check, and never a product whose own
page says «Дороже обычного» (the page's verdict on the same daily lows and current price; owner, 12 Nov 2026).

## Other numbers

- **Products under watch**: active products (`products.status = 'active'`), all time.
- **Most tracked** («Чаще всего отслеживают»): products with a price that 2+ people track; hidden until there is one.
- **Sellers with offers**: distinct sellers in `offers_current` of active products (each product's latest check).
- **Seller gap** ("Разница у продавцов"): one product's cheapest and dearest current offer; in stock, 2+ sellers,
  checked in the last 3 days. Offers above twice the product's median offer are left out (11 Nov: one shop at
  759 990 ₸ beside four at 185–203k), and the dearest end counts only shops with 20+ Kaspi reviews (13 Nov: a
  1-review shop at 1 399 858 ₸ beside six at 699 990–839 990 ₸). The median gap and the share above 25% are over those products.
- **Categories**: Kaspi leaf category, 8+ priced in-stock products checked today or yesterday; lowest and median
  current price. The week change, once 5+ of them have one, is the median over products of the current price
  against their earliest daily low 2–7 days ago.
- **New low**: a product seen on 7+ days whose shift daily low is below every earlier daily low.
- **Sale check** (product pages): the lowest price during a sale against the lowest of the 14 days before; within
  ±3% counts as "the same as before the sale" (`packages/core/src/sales.ts`).
- **Hit rate** (admin): product pages opened, once per visit and product; how many already had an observation,
  and how many had their first observation 7+ days before.

## Home lists added 13 Nov 2026 (`getPlatformStats`, `packages/db/src/stats.ts`)
Each home list shows its first ten rows.
- **Changes in tenge** (`tenge`): the same moves as rule D (the shift against the day before, a later check has not undone them), ordered by the difference in tenge instead of percent.
- **The most stable price** (`stable`): the same daily low on every observed day back from the latest one, in stock, still at that price, checked today or yesterday; at least `STABLE_MIN_DAYS` (5) observed days. Most days first, then Kaspi reviews. Days we did not observe are not counted. The past, not a forecast.
- **Shops by Kaspi rating** (`shops`): shops with an offer on an active product and at least `SHOP_BOARD_MIN_REVIEWS` (100) Kaspi reviews; highest rating first (then more reviews) and lowest first. Kaspi's numbers as we last saw them, no judgment of ours.
- **Categories**: `getMarket().categories`, the ten Kaspi leaf categories we watch the most products in (from 8 priced products).

## Profiles and the board (`packages/db/src/profile.ts`)
- **Отслеживаю / На сумму**: active trackings and the sum of their current lowest prices.
- **Хочу сэкономить**: the sum over active trackings of the current lowest price minus the person's own price, where the price is above it. The board ranks by it (then products tracked, then the earlier visitor).
- **Сэкономил(а)**: the start price minus the lowest alert price, only for trackings with a sent target alert and the answer «Да, купил» (the same rule as "saved" in the owner's report).
- **Suggestions**: products the person does not track, in stock, with 3+ observed days in the last 30; their categories first, then the interests they named; furthest below their own 30-day highest daily low first.
- **3-day note**: each tracked product's current lowest price against its last observed price from 3 days ago or earlier; a move needs `MOVE_MIN_PCT`.

## KPI definitions (Telegram report, /admin, /admin/business; `packages/core/src/metrics.ts`)

Three kinds of numbers, never mixed in one rate:

- **Visit-based**: one browser tab (`events.sid`), all history from 3 Nov 2026. *Visits* = tabs with any event in
  the window; *opened a product*, *pasted a link*, *started tracking*, *from posts* = visits with that event (posts:
  the visit's `source` is a utm_source, i.e. not a site host and not "direct"). Rates divide by visits.
- **Person-based**: one browser (`events.vid`, live since 11 Nov 2026 about 12:45 Almaty). Used only for windows that
  start on or after `PERSON_METRICS_FROM` (12 Nov 2026, the first full day); earlier windows show «—». *People*,
  *researchers* (opened a product, pasted or started tracking), *returning* (seen before the window), *Monthly Active
  Price Researchers* (30 days, counted from 12 Nov until 30 days exist). In-app browsers (Instagram, Telegram) keep
  their own storage, so returning people are undercounted.
- **Account-based**: `watchers` and `trackings`, exact for all history. *People with alerts*; *connected* = Telegram
  linked or email confirmed (now); in a window: people who started their list in it, and of them those connected.

Windows are Almaty days including today (7 days = today and the 6 before). The "visitors per day" target uses people
once the 7 days before are person-reliable (from 19 Nov 2026), visits until then, and says which.

**Paste outcome** (the `paste` event's `detail`, from 11 Nov 2026; older events have none): `ok`, `queued` (Kaspi app
link waiting for the collector), `not_a_url`, `not_kaspi`, `not_a_product`, `short_link_failed`, `check_failed`,
`rate_limited`, `network`, `unknown`. "Product unavailable" is known only later, when the collector fails a queued
link (`short_link_queue.status = 'failed'`).

**Notifications** (`alertStats`, `packages/db/src/alertStats.ts`): *products with alerts* and *people with alerts* =
distinct products / watchers with a sent `target_reached`; *triggers* = distinct `tracking:episode`; *target messages*
= sent `target_reached` rows (one per channel per trigger); *sent / failed / waiting* = all notification rows by status
("sent" = accepted by Telegram or the email service; inbox delivery is not reported); *clicks* = rows with `clicked_at`,
and the distinct products behind them. Several messages for one product never count as several products.
