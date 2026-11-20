-- «Поймали снижение» never shrinks (numbers audit, 20 Nov 2026; DECISIONS.md 2026-11-20 "Numbers audit fixes").
-- caught_live: every price drop a sent target alert caught for a real person, as it stands now: the price when the
-- tracking began (the lowest observed then, else the first one after; a city tracking reads that city's prices) minus
-- the lowest price an alert reported. Only drops, and only plausible ones: an alert at least PLAUSIBLE_RATIO (0.2, i.e.
-- MAX_DROP_PCT 80) of the start price, so one seller's absurd listing cannot add a million (the 1 450 000 ₸ boots).
create view caught_live with (security_invoker = true) as
with hit as (
  select n.tracking_id, min(n.price) as alert_price from notifications n
  where n.type = 'target_reached' and n.status = 'sent' group by n.tracking_id)
select t.id as tracking_id, t.product_id, t.bought, st.start as start_price, h.alert_price
from hit h join trackings t on t.id = h.tracking_id
cross join lateral (select case when coalesce(t.city, 'almaty') = 'almaty' then coalesce(
    (select o.min_price from price_observations o where o.product_id = t.product_id and o.observed_at <= t.created_at
       and o.min_price is not null order by o.observed_at desc limit 1),
    (select o.min_price from price_observations o where o.product_id = t.product_id and o.observed_at > t.created_at
       and o.min_price is not null order by o.observed_at limit 1))
  else coalesce(
    (select c.min_price from city_prices c where c.product_id = t.product_id and c.city = t.city and c.observed_at <= t.created_at
       and c.min_price is not null order by c.observed_at desc limit 1),
    (select c.min_price from city_prices c where c.product_id = t.product_id and c.city = t.city and c.observed_at > t.created_at
       and c.min_price is not null order by c.observed_at limit 1)) end as start) st
where t.watcher_id is not null
  and not exists (select 1 from watchers w where w.id = t.watcher_id and w.internal)
  and st.start > h.alert_price
  and h.alert_price >= st.start * 0.2;

-- The ledger: a caught drop stays counted after the person deletes their data or the tracking goes. No foreign keys
-- on purpose. Written by the worker after its sends (recordCaughtDrops) and filled here with what is caught so far.
create table caught_drops (
  tracking_id uuid primary key,
  product_id bigint not null,
  start_price integer not null check (start_price > 0),
  alert_price integer not null check (alert_price > 0),
  recorded_at timestamptz not null default now()
);
alter table caught_drops enable row level security;
insert into caught_drops (tracking_id, product_id, start_price, alert_price)
  select tracking_id, product_id, start_price, alert_price from caught_live;

-- The daily owner report reads both (0024's rule: a table added later needs its own line).
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'baga_reporter') then
    grant select on caught_drops, caught_live to baga_reporter;
    create policy reporter_read on caught_drops for select to baga_reporter using (true);
  end if;
  if exists (select 1 from pg_roles where rolname = 'baga_web') then
    grant select, insert, update on caught_drops to baga_web;
    grant select on caught_live to baga_web;
  end if;
end $$;
