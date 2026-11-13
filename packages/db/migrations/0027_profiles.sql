-- A visitor's profile without personal data (DECISIONS.md, 2026-11-13 "Profiles, leaderboard and the 3-day note"):
-- a made-up nickname, one of the stock avatars and three short answers, kept on the anonymous watcher. The
-- leaderboard shows the nickname and avatar next to sums of the watcher's own trackings; on_board = false hides
-- the watcher from it. digest = false stops the 3-day note; digest_sent_at is when the last one was claimed.
alter table watchers add column nickname text check (char_length(nickname) between 2 and 20);
alter table watchers add column avatar text check (avatar ~ '^[a-z]{2,12}$');
alter table watchers add column visit_reason text check (visit_reason ~ '^[a-z_]{2,24}$');
alter table watchers add column interests text[] not null default '{}';
alter table watchers add column save_goal int check (save_goal between 1000 and 100000000);
alter table watchers add column profile_at timestamptz;
alter table watchers add column on_board boolean not null default true;
alter table watchers add column digest boolean not null default true;
alter table watchers add column digest_sent_at timestamptz;
create unique index watchers_nickname on watchers (lower(nickname)) where nickname is not null;
