-- Requests actually sent to Kaspi by each collector run (review of 5 Nov 2026, item 16): checks and saved
-- observations do not say how many requests a run made (page refreshes, re-checks, alert confirmations, short
-- links). Null for runs before this migration: unknown, never back-filled.
alter table collection_runs add column requests integer;
