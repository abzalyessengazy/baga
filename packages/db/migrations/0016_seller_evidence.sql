-- Shop evidence (DECISIONS.md, 2026-11-05 "Shop evidence, not verdicts").
-- 1. Kaspi's rating and review count of each shop, once per Almaty day it is seen (the latest value of the day):
--    review growth over weeks is the closest honest stand-in for how much a shop sells.
create table seller_daily (
  seller_id bigint not null references sellers (id) on delete cascade,
  day date not null,
  rating real,
  reviews integer,
  primary key (seller_id, day)
);
alter table seller_daily enable row level security;

-- 2. When BAGA first saw the shop. Shops seen before this migration stay null (unknown), never back-dated.
alter table sellers add column first_seen_at timestamptz;
alter table sellers alter column first_seen_at set default now();

-- 3. After "Вы купили? — Да": which shop it was bought from (optional) and how the purchase went. One answer per
--    tracking, removed with it (Forget me deletes the watcher, its trackings and this).
create table seller_feedback (
  tracking_id uuid primary key references trackings (id) on delete cascade,
  seller_id bigint references sellers (id) on delete set null,
  outcome text not null check (outcome in ('ok', 'late', 'not_as_described', 'not_delivered')),
  created_at timestamptz not null default now()
);
create index seller_feedback_seller on seller_feedback (seller_id) where seller_id is not null;
alter table seller_feedback enable row level security;
