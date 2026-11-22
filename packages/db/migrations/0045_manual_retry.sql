-- A manual check MarketParser failed on (no answer in time, its error) is tried once more 5 minutes later before it
-- waits for the morning collector (the owner, 22 Nov 2026: on 21 Nov 4 of 7 checks failed that way and their people
-- waited until morning). `attempts`: tries that failed; `retry_at`: not before this time.
alter table manual_checks add column attempts smallint not null default 0;
alter table manual_checks add column retry_at timestamptz;
