-- Security check, 16 Nov 2026: BAĞA never uses Supabase's public REST API (the site and the collector connect to
-- Postgres directly), yet Supabase's public roles `anon` and `authenticated` kept their default rights on every table,
-- and four policies from the first schema (written for Supabase Auth, which BAĞA never adopted) still let a holder of
-- the project's public key insert feedback rows. Close both. The owner's read-only `baga_reporter` role is untouched.
-- Guarded: plain Postgres (CI, local) has no anon/authenticated roles and no auth schema.

drop policy if exists "own profile" on profiles;
drop policy if exists "own trackings" on trackings;
drop policy if exists "own notifications" on notifications;
drop policy if exists "insert feedback" on feedback;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
      execute format('alter default privileges in schema public revoke all on sequences from %I', r);
      execute format('alter default privileges in schema public revoke all on functions from %I', r);
    end if;
  end loop;
end $$;
