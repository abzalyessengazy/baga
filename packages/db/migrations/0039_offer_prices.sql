-- Each seller's own price history per product (DECISIONS.md 2026-11-18 "Sellers' price changes"). offers_current only
-- holds the latest check; this keeps a row whenever a seller's price for a product differs from its last row (and the
-- first time we see it), so the sellers table can say «▲ 30 000 ₸ · 15 ноя». Observed prices only, no new requests:
-- every check already reads all sellers. Seeded with today's offers, so the first change after this already shows.
create table offer_prices (
  product_id bigint not null references products(id) on delete cascade,
  seller_id bigint not null references sellers(id) on delete cascade,
  price integer not null check (price > 0),
  seen_at timestamptz not null default now(),
  primary key (product_id, seller_id, seen_at)
);
alter table offer_prices enable row level security;

insert into offer_prices (product_id, seller_id, price, seen_at)
  select product_id, seller_id, price, updated_at from offers_current where price > 0;
