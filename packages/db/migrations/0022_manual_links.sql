-- A manual check can also start from a queued link (DECISIONS.md 2026-11-09, amended 10 Nov): a phone link to clothes
-- or shoes (a letter code) or a short link Kaspi did not answer from the website. The manual run finds the product
-- number (1-2 requests), then checks it like any manual check; it counts in the same 40 a day and 3 per visitor.
alter table manual_checks alter column external_id drop not null;
alter table manual_checks add column link_code text references short_link_queue(code) on delete cascade
  check (link_code ~ '^[A-Za-z0-9_-]{4,64}$');
alter table manual_checks add constraint manual_checks_one_target check (num_nonnulls(external_id, link_code) = 1);
create index manual_checks_link on manual_checks (link_code) where link_code is not null;
