-- Security audit, 20 Nov 2026 (DECISIONS.md 2026-11-20 "Security audit fixes"). The website's one Kaspi request (a
-- non-following GET of l.kaspi.kz for a pasted short link) now keeps rule 6 like the collector: at least 10 s between
-- requests across every Vercel instance, and none for a day after Kaspi answers 403/429. One shared row.
create table web_kaspi_gate (
  id smallint primary key default 1 check (id = 1),
  last_request_at timestamptz,
  blocked_until timestamptz,
  blocked_status smallint
);
insert into web_kaspi_gate (id) values (1);
alter table web_kaspi_gate enable row level security;

-- Row level security was still off on these two (from 0014 and 0031). Nothing reads them through Supabase's public API
-- (0033 removed those rights), but a stray grant later would expose chat ids and email hashes; with it on, only the
-- site's own role (policy web_all, added by the migration runner) and the collector reach them.
alter table email_requests enable row level security;
alter table reminders enable row level security;
