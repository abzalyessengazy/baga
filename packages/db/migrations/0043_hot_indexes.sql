-- Cost and reliability audit, 20 Nov 2026: three busy lookups had no index. The tables are small today (minutes of
-- locking at most); `create index` without `concurrently` because migrations run in a transaction.
-- Deleting a tracking (cascade), «Вы купили?», the caught drops (caught_live), the removal update.
create index if not exists notifications_tracking on notifications (tracking_id);
-- The report's connect lookups by visit.
create index if not exists events_sid on events (sid, at);
-- «Новые в BAĞA»'s added-by-a-person check, run once per product.
create index if not exists events_external_id on events (external_id, name) where external_id is not null;
