-- Browser notifications (DECISIONS.md 2026-11-18 "Browser notifications"): a third channel that needs no app, number or
-- address, one tap on «Разрешить». One row per browser that allowed them; the push service's address and the browser's
-- public keys, nothing else. A service that answers 404/410 (permission withdrawn, browser data cleared) removes its row.
create table push_subscriptions (
  id bigserial primary key,
  watcher_id uuid not null references watchers(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1024),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{40,200}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{10,64}$'),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index push_subscriptions_watcher on push_subscriptions (watcher_id);
alter table push_subscriptions enable row level security;

alter table notifications drop constraint notifications_channel_check;
alter table notifications add constraint notifications_channel_check check (channel in ('email', 'telegram', 'push'));
