-- Seed priorities (DECISIONS.md, 2026-11-03 "Seed priorities"): a seed row may carry the first price it needs to
-- stay in the catalog (rare categories: 50 000 ₸). Below it, the product is kept with its observed price but is
-- not a seed product (checked weekly, like any product nobody watches).
alter table seed_queue add column min_price integer check (min_price > 0);
