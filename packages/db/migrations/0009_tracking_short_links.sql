-- A visitor can set a price on a Kaspi app short link the website could not resolve yet (Kaspi does not answer
-- Vercel). The tracking waits on the short link; when the collector resolves it, the tracking gets the product's
-- external_id (DECISIONS.md, 2026-11-02 "Tracking a short link before it is resolved").
alter table trackings add column short_link_code text references short_link_queue(code) on delete cascade;
alter table trackings drop constraint trackings_product;
alter table trackings add constraint trackings_product check (product_id is not null or external_id is not null or short_link_code is not null);
create unique index trackings_watcher_short_link on trackings (watcher_id, short_link_code)
  where watcher_id is not null and short_link_code is not null and external_id is null;
