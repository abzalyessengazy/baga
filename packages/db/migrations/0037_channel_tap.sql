-- The connect step, measured (18 Nov 2026: 63 of 90 people tracking a product could not be reached). One event when a
-- visitor taps «Подключить Telegram» (detail: where) or sends an email confirmation (detail: email), so the report can
-- tell "never tried" from "tried and did not finish" (pressed nothing in the bot, never confirmed the email).
alter table events drop constraint events_name_check;
alter table events add constraint events_name_check
  check (name in ('visit', 'paste', 'product_view', 'track', 'channel', 'channel_tap'));
