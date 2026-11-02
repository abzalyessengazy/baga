-- Kaspi does not answer Vercel on l.kaspi.kz either (2 Nov 2026: the resolver hung until Vercel's 300 s limit), so a
-- short link the website cannot resolve is queued here. The collector resolves it inside Kaspi's visit window
-- (one GET that does not follow the redirect), then queues the product as a visitor request.
create table short_link_queue (
  code text primary key check (code ~ '^[A-Za-z0-9_-]{4,64}$'),
  path text not null check (path ~ '^/(shop/)?[A-Za-z0-9_-]{4,64}$'),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'failed')),
  external_id text,
  slug text,
  attempts integer not null default 0,
  last_error text,
  added_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index short_link_queue_pending on short_link_queue (added_at) where status = 'pending';
alter table short_link_queue enable row level security;
