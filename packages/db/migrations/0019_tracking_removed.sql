-- «Удалить» in «Мои товары» keeps the tracking as history instead of deleting it (the owner, 8 Nov 2026): its
-- target, dates, alerts sent and «Вы купили?» answer stay for the funnel; nothing is sent for it any more and its
-- product falls back to its catalog tier at the next check. «Удалить мои данные» still deletes everything.
alter table trackings drop constraint trackings_status_check;
alter table trackings add constraint trackings_status_check check (status in ('pending', 'active', 'paused', 'done', 'removed'));
alter table trackings add column removed_at timestamptz;
