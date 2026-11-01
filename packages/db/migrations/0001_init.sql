-- BAGA initial schema. Prices are integer tenge. Price history is shared per product, never per user.
-- One national price: Kaspi's lowest price is the same across cities (checked 1 Nov 2026).

create table marketplaces (
  id smallserial primary key,
  code text not null unique,
  name text not null,
  base_url text not null,
  is_active boolean not null default true
);
insert into marketplaces (code, name, base_url) values ('kaspi', 'Kaspi.kz', 'https://kaspi.kz');

create table products (
  id bigserial primary key,
  marketplace_id smallint not null references marketplaces(id),
  external_id text not null,
  slug text,
  title text not null,
  title_kk text,
  category_path text[] not null default '{}',
  image_url text,
  status text not null default 'active' check (status in ('active', 'delisted')),
  is_seed boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_viewed_at timestamptz,
  unique (marketplace_id, external_id)
);

-- Current snapshot, updated on every check.
create table product_state (
  product_id bigint primary key references products(id) on delete cascade,
  current_min_price integer,
  offer_count integer not null default 0,
  in_stock boolean not null default false,
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  observed_since timestamptz not null default now()
);

-- Append-only. A row is written when min price, stock or offer count changes, plus one daily heartbeat.
create table price_observations (
  id bigserial primary key,
  product_id bigint not null references products(id) on delete cascade,
  observed_at timestamptz not null default now(),
  min_price integer,
  median_price integer,
  offer_count integer not null,
  in_stock boolean not null,
  run_id bigint
);
create index price_observations_product_time on price_observations (product_id, observed_at desc);

create table sellers (
  id bigserial primary key,
  marketplace_id smallint not null references marketplaces(id),
  external_id text not null,
  name text not null,
  rating real,
  reviews integer,
  unique (marketplace_id, external_id)
);

create table offers_current (
  product_id bigint not null references products(id) on delete cascade,
  seller_id bigint not null references sellers(id) on delete cascade,
  price integer not null,
  delivery_duration text,
  updated_at timestamptz not null default now(),
  primary key (product_id, seller_id)
);

create table collection_schedule (
  product_id bigint primary key references products(id) on delete cascade,
  next_check_at timestamptz not null default now(),
  priority text not null default 'seed' check (priority in ('hot', 'tracked', 'seed', 'cold')),
  interval_minutes integer not null default 720,
  fail_count integer not null default 0,
  last_error text,
  locked_until timestamptz
);
create index collection_schedule_due on collection_schedule (next_check_at) where fail_count < 10;

create table collection_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  checked integer not null default 0,
  changed integer not null default 0,
  failed integer not null default 0,
  aborted_reason text,
  runner text not null
);

-- User data (owned by Supabase Auth users)
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  locale text not null default 'ru' check (locale in ('ru', 'kk')),
  email_alerts_enabled boolean not null default true,
  telegram_chat_id bigint,
  created_at timestamptz not null default now()
);

create table trackings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id bigint not null references products(id) on delete cascade,
  target_price integer not null check (target_price > 0),
  status text not null default 'pending' check (status in ('pending', 'active', 'paused', 'done')),
  alert_state text not null default 'armed' check (alert_state in ('armed', 'triggered')),
  episode integer not null default 0,
  last_triggered_at timestamptz,
  above_since timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);
create index trackings_active_by_product on trackings (product_id) where status = 'active';

create table notifications (
  id bigserial primary key,
  tracking_id uuid not null references trackings(id) on delete cascade,
  type text not null default 'target_reached',
  channel text not null default 'email',
  price integer not null,
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  clicked_at timestamptz
);

create table feedback (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  product_id bigint references products(id) on delete set null,
  kind text not null,
  text text,
  created_at timestamptz not null default now()
);

-- Row-level security: users see only their own rows. Catalog tables are read through server code only.
alter table profiles enable row level security;
alter table trackings enable row level security;
alter table notifications enable row level security;
alter table feedback enable row level security;
alter table products enable row level security;
alter table product_state enable row level security;
alter table price_observations enable row level security;
alter table sellers enable row level security;
alter table offers_current enable row level security;
alter table collection_schedule enable row level security;
alter table collection_runs enable row level security;
alter table marketplaces enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own trackings" on trackings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notifications" on notifications for select
  using (exists (select 1 from trackings t where t.id = tracking_id and t.user_id = auth.uid()));
create policy "insert feedback" on feedback for insert with check (user_id is null or auth.uid() = user_id);
