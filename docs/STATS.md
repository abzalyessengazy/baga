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

**Shift.** The latest Almaty day with a successful check (`max(last_checked_at)` of `product_state`). One
collector run a day, 09:05–13:30 Almaty.

**Change.** Two prices differ by `MOVE_MIN_PCT` (1%) of the earlier one or more (`packages/core/src/moves.ts`,
`moveDirection`). Smaller differences are "no change": sellers nudge prices by a few tenge all the time.

## Rule D: the shift against the previous day (`dayMoves`, `packages/db/src/movers.ts`)

For each active product with a daily low on the shift: compare it with the product's previous daily low (the most
recent earlier day it was seen in stock, however long ago).

- **Checked**: active products with a check on the shift day (in stock or not).
- **Compared**: of those, products with a daily low on the shift and on an earlier day.
- **Cheaper / dearer**: compared products whose change is a Change down / up. **Same** = compared − cheaper − dearer.

Used by: "Kaspi сегодня" (checked, ↓, ↑, compared), the Z-report totals (checked in the shift, price changed,
of them cheaper) and the Z-report "День" lists (biggest percent first).

## Rule W: now against the previous 7 days (`weekMovers`, `packages/db/src/movers.ts`)

The product's current lowest price (`product_state.current_min_price`, in stock, checked on the shift or the day
before) against its daily lows of the 7 Almaty days before today:

- **Drop**: current price at least `MOVE_MIN_PCT` below the **highest** of those daily lows.
- **Rise**: current price at least `MOVE_MIN_PCT` above the **lowest** of those daily lows.

A drop that has since gone back up is not a drop any more. Biggest percent first.

Used by: `/drops`, the Z-report "Неделя" lists, "Самое большое снижение недели" (the first drop), the find of the
day (when its drop is bigger in percent than the best seller gap) and the Telegram channel (which posts only drops
of 5% or more, its own bar for a post worth sending).

## Other numbers

- **Products under watch**: active products (`products.status = 'active'`), all time.
- **Sellers with offers**: distinct sellers in `offers_current` of active products (each product's latest check).
- **Seller gap** ("Разница у продавцов"): one product's cheapest and dearest current offer; in stock, 2+ sellers,
  checked in the last 3 days. The median gap and the share above 25% are over those products.
- **Categories**: Kaspi leaf category, 8+ priced in-stock products checked today or yesterday; lowest and median
  current price. The week change, once 5+ of them have one, is the median over products of the current price
  against their earliest daily low 2–7 days ago.
- **New low**: a product seen on 7+ days whose shift daily low is below every earlier daily low.
- **Sale check** (product pages): the lowest price during a sale against the lowest of the 14 days before; within
  ±3% counts as "the same as before the sale" (`packages/core/src/sales.ts`).
- **Hit rate** (admin): product pages opened, once per visit and product; how many already had an observation,
  and how many had their first observation 7+ days before.
