-- Technodom as a second price source (DECISIONS.md, 2026-11-07). Prices from other stores never enter Kaspi's
-- tables (products, offers_current, price_observations): they hang off an exact match to one of our Kaspi products.
insert into marketplaces (code, name, base_url) values ('technodom', 'Technodom', 'https://www.technodom.kz')
  on conflict (code) do nothing;

-- One row per (our product, store item) pair the matcher looked at. Only 'confirmed' rows are priced and shown.
-- method: exact = the store's own link to Kaspi is our product; strict = every matching rule holds on the store's title;
-- manual = the owner decided on /admin. A product has at most one confirmed item per store.
create table store_matches (
  id bigserial primary key,
  product_id bigint not null references products(id) on delete cascade,
  marketplace_id smallint not null references marketplaces(id),
  store_sku text not null,
  store_slug text not null,
  store_title text,
  method text not null check (method in ('exact', 'strict', 'manual')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  reason text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (product_id, marketplace_id, store_sku)
);
create unique index store_matches_one_confirmed on store_matches (product_id, marketplace_id) where status = 'confirmed';
create index store_matches_by_status on store_matches (marketplace_id, status);
alter table store_matches enable row level security;

-- The store's price as observed (never adjusted for bonuses or promo codes).
create table store_prices (
  id bigserial primary key,
  match_id bigint not null references store_matches(id) on delete cascade,
  observed_at timestamptz not null default now(),
  price integer check (price > 0),
  old_price integer check (old_price > 0),
  in_stock boolean not null
);
create index store_prices_latest on store_prices (match_id, observed_at desc);
alter table store_prices enable row level security;

-- One row per store collector run (kept apart from collection_runs, which the website reads as Kaspi's).
create table store_runs (
  id bigserial primary key,
  marketplace_id smallint not null references marketplaces(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  requests integer not null default 0,
  priced integer not null default 0,
  matched integer not null default 0,
  failed integer not null default 0,
  aborted_reason text
);
alter table store_runs enable row level security;
