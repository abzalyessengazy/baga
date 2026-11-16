-- Where a price was seen (DECISIONS.md 2026-11-17): 'kaspi' = our own collector, 'marketparser' = a visitor's
-- manual check done by MarketParser (BAĞA sends no Kaspi request outside the collector's window).
alter table price_observations add column source text not null default 'kaspi'
  check (source in ('kaspi', 'marketparser'));
