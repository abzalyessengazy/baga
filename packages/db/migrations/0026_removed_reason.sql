-- Why a visitor removed a product from «Мои товары» (owner, 11 Nov 2026): one optional tap when removing.
-- 'bought' also sets trackings.bought = 'yes' and 'changed_mind' sets 'no', so "Вы купили?" numbers include them.
alter table trackings add column removed_reason text
  check (removed_reason in ('bought', 'bought_elsewhere', 'changed_mind', 'price_never_dropped'));
