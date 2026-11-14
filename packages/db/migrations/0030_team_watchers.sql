-- The owner's own browsers (DECISIONS.md, 2026-11-14 "The team leaves the numbers"): a watcher marked internal is
-- left out of the leaderboard and of every business number (people, trackings, alerts, purchases), and a browser id
-- (events.vid) seen with such a watcher's cookie goes into internal_visitors: its funnel steps are deleted and new
-- ones are not stored.
alter table watchers add column internal boolean not null default false;
create table internal_visitors (
  vid text primary key check (vid ~ '^[A-Za-z0-9_-]{16,32}$'),
  at timestamptz not null default now()
);
alter table internal_visitors enable row level security;
