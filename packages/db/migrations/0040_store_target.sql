-- «Ваша цена есть на Halyk Market / Technodom» (the owner, 19 Nov 2026; DECISIONS.md 2026-11-19 "Target reached at
-- another store"): a tracking's target met by an exactly matched store's observed price while Kaspi is still above it.
-- The message points at the store match it is about.
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('target_reached', 'first_price', 'bought_ask', 'store_target'));
alter table notifications add column match_id bigint references store_matches(id) on delete set null;
