-- Audit follow-ups, 20 Nov 2026 (DECISIONS.md 2026-11-20 "Audit leftovers fixed").
--
-- 1. Browser notifications per browser: the browsers (push_subscriptions.id) that already took a notification. A retry
--    after one browser failed, or after a crash in the middle of a send, goes only to the browsers not in this list, so
--    nobody gets the same notification twice and a browser that missed it still gets it.
alter table notifications add column push_done bigint[] not null default '{}';

-- 2. The website's role (migration 0034) only reads the tables the collector and the store run fill: prices, sellers,
--    city and store prices, runs, the caught-drops ledger, the migration ledger. A leaked site password can then not
--    rewrite price history (CLAUDE.md rule 2). The site keeps its writes on its own tables (watchers, trackings, queues,
--    events, feedback, ...), on products (last_viewed_at), collection_schedule (a tracked product's tier), notifications
--    (a removed tracking's queued messages) and store_matches (the owner's ✓/✗ on /admin). Cascades on delete run as
--    the table owner, so «Удалить мои данные» still works.
do $$
declare t text;
begin
  if exists (select 1 from pg_roles where rolname = 'baga_web') then
    foreach t in array array['price_observations', 'offers_current', 'offer_prices', 'product_state', 'sellers', 'seller_daily',
      'city_prices', 'store_prices', 'store_runs', 'store_items', 'store_categories', 'collection_runs', 'caught_drops',
      'marketplaces', '_migrations'] loop
      if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
        execute format('revoke insert, update, delete, truncate on public.%I from baga_web', t);
      end if;
    end loop;
  end if;
end $$;
