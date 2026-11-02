-- Tracking before registration (DECISIONS.md, 2026-11-02). A watcher is an anonymous visitor: a random secret kept
-- in an httpOnly cookie and in a private link; only its SHA-256 is stored. Alerts go to Telegram. Phase 4 moves a
-- watcher's trackings into a registered account (user_id) and adds the per-account limits.
create table watchers (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null unique check (secret_hash ~ '^[0-9a-f]{64}$'),
  locale text not null default 'ru' check (locale in ('ru', 'kk')),
  telegram_chat_id bigint unique,
  -- One-time code for the bot deep link t.me/<bot>?start=<code>; rotated after use.
  telegram_link_code text unique check (telegram_link_code ~ '^[A-Za-z0-9_-]{16,64}$'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table watchers enable row level security;

-- A tracking belongs to a registered user or to a watcher. Watcher trackings may point at a product the collector
-- has not fetched yet: external_id is always set, product_id is filled in when the product is first collected.
alter table trackings alter column user_id drop not null;
alter table trackings alter column product_id drop not null;
alter table trackings add column watcher_id uuid references watchers(id) on delete cascade;
alter table trackings add column external_id text check (external_id ~ '^\d{5,12}$');
alter table trackings add column first_price_sent_at timestamptz;
alter table trackings add constraint trackings_owner check (user_id is not null or watcher_id is not null);
alter table trackings add constraint trackings_product check (product_id is not null or external_id is not null);
update trackings t set external_id = p.external_id from products p where p.id = t.product_id and t.external_id is null;
create unique index trackings_watcher_product on trackings (watcher_id, external_id) where watcher_id is not null;
create index trackings_waiting_product on trackings (external_id) where product_id is null;

-- Telegram notifications, and the "first price" message sent when a product queued with a tracking is first collected.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in ('target_reached', 'first_price'));
alter table notifications add constraint notifications_channel_check check (channel in ('email', 'telegram'));
