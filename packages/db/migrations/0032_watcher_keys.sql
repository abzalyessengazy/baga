-- Sign-in links in alerts (DECISIONS.md, 2026-11-16 "Sign-in links in alerts"): a link in a Telegram or email alert
-- opens «Мои товары» in any browser, Telegram's own included. access_code is the personal code the links carry (the
-- worker sets it the first time it needs it); each browser that came in through one gets its own key here, so the
-- browser the visitor started in keeps its cookie. «Выйти на других устройствах» deletes the keys and the code.
alter table watchers add column access_code text unique check (access_code ~ '^[A-Za-z0-9_-]{24,64}$');
create table watcher_keys (
  secret_hash text primary key check (secret_hash ~ '^[0-9a-f]{64}$'),
  watcher_id uuid not null references watchers(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index watcher_keys_by_watcher on watcher_keys (watcher_id);
alter table watcher_keys enable row level security;
