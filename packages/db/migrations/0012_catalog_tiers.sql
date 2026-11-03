-- Catalog tiers (DECISIONS.md, 2026-11-03 "More products in the same Kaspi budget").
-- Kaspi's own review count and rating, from the product page we already fetch; null until the next page refresh.
alter table products add column kaspi_reviews integer check (kaspi_reviews >= 0);
alter table products add column kaspi_rating real;
create index products_seed_reviews on products (kaspi_reviews) where is_seed and status = 'active';

-- 'catalog': seed products outside the most reviewed ones, checked every third day instead of daily.
alter table collection_schedule drop constraint if exists collection_schedule_priority_check;
alter table collection_schedule add constraint collection_schedule_priority_check
  check (priority in ('hot', 'tracked', 'seed', 'catalog', 'cold'));
