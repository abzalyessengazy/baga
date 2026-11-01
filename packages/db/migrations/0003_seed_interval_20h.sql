-- Seed interval is now 20 h (packages/core INTERVAL_MINUTES.seed) so every product gets a check each calendar day
-- with collection every 4 h. The worker sets interval_minutes after each check; this only changes the default for new rows.
alter table collection_schedule alter column interval_minutes set default 1200;
