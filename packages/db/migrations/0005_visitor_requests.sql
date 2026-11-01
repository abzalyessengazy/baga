-- The website never requests Kaspi (DECISIONS.md, 2026-11-01): visitor lookups are queued here and fetched by
-- the collector inside Kaspi's robots.txt window, before routine checks.
alter table seed_queue add column source text not null default 'seed' check (source in ('seed', 'visitor'));
-- status 'not_found': Kaspi has no such product. Kept so the page can say so and it is not requested again daily.
alter table seed_queue add column status text not null default 'pending' check (status in ('pending', 'not_found'));
create index seed_queue_pending on seed_queue (source, added_at) where status = 'pending';
