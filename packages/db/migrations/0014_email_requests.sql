-- A durable ledger of confirmation emails asked for (review of 5 Nov 2026): the daily limits count emails, not
-- watcher rows, so re-asking from the same browser cannot get past them. The address is kept only as a SHA-256
-- hash and rows older than 2 days are deleted by the collector.
create table email_requests (
  id bigserial primary key,
  email_hash bytea not null,
  watcher_id uuid not null references watchers (id) on delete cascade,
  at timestamptz not null default now()
);
create index email_requests_email on email_requests (email_hash, at);
create index email_requests_watcher on email_requests (watcher_id, at);
