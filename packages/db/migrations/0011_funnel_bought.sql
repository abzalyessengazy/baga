-- In-house funnel and "Вы купили?" (DECISIONS.md, 2026-11-03 "In-house funnel instead of PostHog").

-- One row per step a visitor reaches. sid is a random id the browser keeps in sessionStorage for one tab (no
-- cookie, no IP, no account); it only joins the steps of one visit. Kept 180 days (the collector deletes older).
create table events (
  id bigserial primary key,
  at timestamptz not null default now(),
  name text not null check (name in ('visit', 'paste', 'product_view', 'track', 'channel')),
  sid text not null check (sid ~ '^[A-Za-z0-9_-]{16,32}$'),
  locale text check (locale in ('ru', 'kk')),
  device text check (device in ('mobile', 'desktop')),
  source text check (length(source) <= 64),
  external_id text check (external_id ~ '^\d{5,12}$'),
  detail text check (length(detail) <= 32)
);
create index events_at on events (at);
alter table events enable row level security;

-- "Вы купили?": asked once, about a day after a target alert (Telegram buttons, an email link, or "Мои товары").
-- bought_code authenticates the answer from Telegram or email without the browser cookie.
alter table trackings add column bought text check (bought in ('yes', 'later', 'no'));
alter table trackings add column bought_at timestamptz;
alter table trackings add column bought_asked_at timestamptz;
alter table trackings add column bought_code text unique check (bought_code ~ '^[A-Za-z0-9_-]{16,64}$');

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in ('target_reached', 'first_price', 'bought_ask'));
