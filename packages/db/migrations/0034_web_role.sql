-- The website's own database user (security check, 16 Nov 2026; DECISIONS.md "Security check: first fixes"). Until
-- now the site connected as `postgres`, which can change the schema, read Supabase's own schemas and skip every
-- policy. `baga_web` can only read and write rows in `public`: no schema changes, no other schemas, no roles.
-- It cannot log in until the owner gives it a password in the Supabase SQL editor (never in this public repo):
--   alter role baga_web with login password '<a long random password>';
-- and puts the pooler URL for it (user baga_web.<project ref>) in Vercel's DATABASE_URL. The collector and the
-- migrations keep the `postgres` account.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'baga_web') then
    create role baga_web nologin;
  end if;
end $$;

grant usage on schema public to baga_web;
grant select, insert, update, delete on all tables in schema public to baga_web;
grant usage, select, update on all sequences in schema public to baga_web;
alter default privileges in schema public grant select, insert, update, delete on tables to baga_web;
alter default privileges in schema public grant usage, select, update on sequences to baga_web;

-- Row level security is on everywhere with no policies for the site's rows: this role gets one open policy per table.
-- The migration runner repeats this after every run (packages/db/src/migrate.ts), so a later table never locks the
-- site out.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop policy if exists web_all on public.%I', t.tablename);
    execute format('create policy web_all on public.%I for all to baga_web using (true) with check (true)', t.tablename);
  end loop;
end $$;
