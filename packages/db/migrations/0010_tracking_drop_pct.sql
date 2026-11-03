-- A visitor can ask for "5–10% / 10–25% / 25%+ cheaper" before a product has its first price. The tracking then
-- keeps the percentage and no price; the collector turns it into target_price (core targetForDrop) when it saves
-- the first price (DECISIONS.md, 2026-11-03 "Percentage targets for products without a price").
alter table trackings add column target_drop_pct smallint check (target_drop_pct between 1 and 90);
alter table trackings alter column target_price drop not null;
alter table trackings add constraint trackings_target check (target_price is not null or target_drop_pct is not null);
