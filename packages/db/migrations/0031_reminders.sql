-- One-off reminders by Telegram (DECISIONS.md, 2026-11-15 "Black Friday reminder"): a visitor taps «Напомнить» on the
-- site, which opens the bot with /start bf_<locale>; the bot keeps the chat here for that topic, and a job sends one
-- message on the day, then marks it sent. No account needed; /stop in the bot deletes the chat's reminders.
create table reminders (
  id bigserial primary key,
  topic text not null check (topic ~ '^[a-z0-9_]{1,40}$'),
  chat_id text not null check (chat_id ~ '^-?\d{1,20}$'),
  locale text not null default 'ru' check (locale in ('ru', 'kk')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (topic, chat_id)
);
