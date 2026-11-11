-- Unique and returning visitors (DECISIONS.md, 2026-11-11 "An anonymous visitor id"): one random id per browser,
-- kept in localStorage (baga.vid; no cookie, no name, no IP), next to the per-tab sid. Older rows have none.
alter table events add column vid text check (vid ~ '^[A-Za-z0-9_-]{16,32}$');
create index events_vid on events (vid, at) where vid is not null;
