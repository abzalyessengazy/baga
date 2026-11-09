-- Price checks a visitor asks for outside the collector's window (DECISIONS.md 2026-11-09 "A visitor's own product
-- checked on request"; CLAUDE.md rule 6): one row per request. At most 40 a day in all and 3 per visitor; the first
-- 403/429 pauses them for 7 days ('blocked'). requester: a daily-rotating hash of the visitor's IP, never the IP.
create table manual_checks (
  id bigserial primary key,
  external_id text not null check (external_id ~ '^\d{5,12}$'),
  requester text not null check (length(requester) = 64),
  requested_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued', 'done', 'failed', 'blocked', 'collector')),
  finished_at timestamptz,
  error text check (length(error) <= 500)
);
create index manual_checks_day on manual_checks (requested_at);
create index manual_checks_queued on manual_checks (requested_at) where status = 'queued';
alter table manual_checks enable row level security;
