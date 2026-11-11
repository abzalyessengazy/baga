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

**Shift.** The latest **complete** Almaty day with checks: today once Kaspi's Visit-time is over (13:45 Almaty,
`lastCompleteShiftDay` in `packages/core/src/window.ts`), yesterday before that. A run still in progress is never
shown as a day, so a morning visitor never sees "checked 29". Products checked on the shift = active products with a
price observation that day (each check writes at least the daily heartbeat). One collector run a day, 09:05–13:30
Almaty. `/api/stats` and `/api/market` are cached by the CDN for up to an hour but never past 13:45 Almaty.

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
more on products from 5 000 ₸, and not a product whose cheapest offer needs a seller check.

## Other numbers

- **Products under watch**: active products (`products.status = 'active'`), all time.
- **Most tracked** («Чаще всего отслеживают»): products with a price that 2+ people track; hidden until there is one.
- **Sellers with offers**: distinct sellers in `offers_current` of active products (each product's latest check).
- **Seller gap** ("Разница у продавцов"): one product's cheapest and dearest current offer; in stock, 2+ sellers,
  checked in the last 3 days. Offers above twice the product's median offer are left out (11 Nov: one shop at
  759 990 ₸ beside four at 185–203k). The median gap and the share above 25% are over those products.
- **Categories**: Kaspi leaf category, 8+ priced in-stock products checked today or yesterday; lowest and median
  current price. The week change, once 5+ of them have one, is the median over products of the current price
  against their earliest daily low 2–7 days ago.
- **New low**: a product seen on 7+ days whose shift daily low is below every earlier daily low.
- **Sale check** (product pages): the lowest price during a sale against the lowest of the 14 days before; within
  ±3% counts as "the same as before the sale" (`packages/core/src/sales.ts`).
- **Hit rate** (admin): product pages opened, once per visit and product; how many already had an observation,
  and how many had their first observation 7+ days before.
