-- Recoverable delivery (review of 5 Nov 2026; packages/core/src/delivery.ts): a message that could not be sent is
-- tried again later instead of failing for good, and a run claims the messages it sends ('sending'), so two
-- overlapping runs can never send the same one.
alter table notifications drop constraint if exists notifications_status_check;
alter table notifications add constraint notifications_status_check check (status in ('queued', 'sending', 'sent', 'failed'));
alter table notifications add column attempts integer not null default 0;
alter table notifications add column next_attempt_at timestamptz not null default now();
alter table notifications add column claimed_at timestamptz;
-- Set right before the provider is called: a crash after it means the message may have gone out.
alter table notifications add column send_started_at timestamptz;
alter table notifications add column last_error text;
create index notifications_due on notifications (channel, next_attempt_at) where status in ('queued', 'sending');
