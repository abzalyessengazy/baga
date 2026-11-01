-- 0001 enables RLS on every app table; the migration ledger is created by migrate.ts, so cover it here.
-- Our server connects as the table owner, which bypasses RLS; this only closes the table to Supabase API roles.
alter table _migrations enable row level security;
