-- A read-only database user for the daily owner report (DECISIONS.md, 2026-11-11 "Daily owner report").
-- The role cannot log in until the owner gives it a password in the Supabase SQL editor (never in this public repo):
--   alter role baga_reporter with login password '<a long random password>';
-- and saves the pooler URL for it (user baga_reporter.<project ref>) as the GitHub secret REPORT_DATABASE_URL.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'baga_reporter') then
    create role baga_reporter nologin;
  end if;
end $$;

grant usage on schema public to baga_reporter;
grant select on all tables in schema public to baga_reporter;
alter default privileges in schema public grant select on tables to baga_reporter;

-- Every table has row level security on and no policies (only the owner role reads it). This role gets a read-only
-- policy on each existing table; a table added later needs the same line in its own migration to be reported.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop policy if exists reporter_read on public.%I', t.tablename);
    execute format('create policy reporter_read on public.%I for select to baga_reporter using (true)', t.tablename);
  end loop;
end $$;
