-- Follow kaspi.kz/robots.txt (DECISIONS.md, 2026-11-01): routine checks fetch offers only; the product page
-- is refreshed weekly. page_checked_at is when the product page was last fetched (null = never / unknown).
alter table products add column page_checked_at timestamptz;
update products set page_checked_at = first_seen_at;

-- Seed products wait here until the collector fetches them inside Kaspi's visit window.
-- The seed script only inserts rows; it makes no Kaspi requests.
create table seed_queue (
  external_id text primary key,
  slug text,
  added_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text
);
alter table seed_queue enable row level security;

-- Seed interval is now 18 h (packages/core INTERVAL_MINUTES.seed).
alter table collection_schedule alter column interval_minutes set default 1080;
