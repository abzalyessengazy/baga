-- Sulpak as a third price source (DECISIONS.md, 2026-11-14 "Sulpak as a third price source"; CLAUDE.md rule 6a).
-- Its product pages live under /g/ (Technodom's under /p/). Sulpak has no product sitemap: its items are read from
-- the category listings of the categories we hold (store_categories), 22 a page, into store_items, and matched to our
-- Kaspi products offline by the strict title rules; confirmed pairs are priced from their product page as Technodom's.
alter table marketplaces add column product_path text not null default '/p/';
insert into marketplaces (code, name, base_url, product_path) values ('sulpak', 'Sulpak', 'https://www.sulpak.kz', '/g/')
  on conflict (code) do nothing;

-- A store's categories (listing addresses) and how far the current read has got. crawled_at: the last full read.
create table store_categories (
  marketplace_id smallint not null references marketplaces(id),
  slug text not null,
  pages integer,
  next_page integer not null default 1,
  crawled_at timestamptz,
  primary key (marketplace_id, slug)
);
alter table store_categories enable row level security;

-- Items seen in a store's listings: the candidates for matching, with the price the listing showed.
create table store_items (
  marketplace_id smallint not null references marketplaces(id),
  sku text not null,
  slug text not null,
  title text not null,
  category text,
  price integer check (price > 0),
  old_price integer check (old_price > 0),
  on_order boolean not null default false,
  seen_at timestamptz not null default now(),
  primary key (marketplace_id, sku)
);
alter table store_items enable row level security;
