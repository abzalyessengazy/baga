-- Prices by city for goods sold by local shops (DECISIONS.md 2026-11-10 "Pharmacy prices by city"; CLAUDE.md rule 7):
-- pharmacy and baby care (packages/core/src/cities.ts). Almaty stays the reference city in price_observations; this
-- table holds what the other cities' sellers request returned, once a day per city. Only observed prices; a city
-- where nobody sells the product has a row with min_price null and offer_count 0.
create table city_prices (
  id bigserial primary key,
  product_id bigint not null references products(id) on delete cascade,
  city text not null check (city in ('astana', 'shymkent', 'atyrau')),
  observed_at timestamptz not null default now(),
  min_price integer check (min_price > 0),
  offer_count integer not null check (offer_count >= 0),
  -- The cheapest sellers, at most 10: [{ "id", "name", "price", "rating", "reviews", "delivery" }].
  sellers jsonb not null default '[]'::jsonb check (jsonb_typeof(sellers) = 'array'),
  run_id bigint
);
create index city_prices_latest on city_prices (product_id, city, observed_at desc);
alter table city_prices enable row level security;
