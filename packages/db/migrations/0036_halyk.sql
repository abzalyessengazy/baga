-- Halyk Market as a price source, phones first, display only (DECISIONS.md 2026-11-17 "Halyk Market, display only";
-- CLAUDE.md rule 6a). A product page lives at /category/<category>/<model>?sku=<variant>; store_slug holds the part
-- after /category/. Halyk shows the lowest price of several sellers: store_prices.offers keeps how many there were.
insert into marketplaces (code, name, base_url, product_path) values ('halyk', 'Halyk Market', 'https://halykmarket.kz', '/category/')
  on conflict (code) do nothing;
alter table store_prices add column offers integer check (offers >= 0);
