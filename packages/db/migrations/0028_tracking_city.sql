-- A tracking's city, and the cities people look at, for goods sold by local shops (DECISIONS.md, 2026-11-14 "Pharmacy:
-- history, alerts and checks by the chosen city"). trackings.city null = Almaty, the reference city; a tracking in
-- another city is judged by that city's prices (city_prices). city_views: a product page opened with that city
-- chosen; the collector asks a city for a product's sellers only while someone tracks or opened it there.
alter table trackings add column city text check (city in ('almaty', 'astana', 'shymkent', 'atyrau'));
create table city_views (
  product_id bigint not null references products(id) on delete cascade,
  city text not null check (city in ('astana', 'shymkent', 'atyrau')),
  last_at timestamptz not null default now(),
  primary key (product_id, city)
);
alter table city_views enable row level security;
-- Keep checking what was checked lately for two more weeks (CITY_CHECKS.viewedDays), so nothing stops the day this
-- applies; from then on only cities people choose.
insert into city_views (product_id, city, last_at)
select distinct product_id, city, now() from city_prices where observed_at > now() - interval '3 days' and city <> 'almaty'
on conflict do nothing;
