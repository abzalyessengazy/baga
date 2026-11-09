-- Variant links (clothes, shoes: a size or colour whose code ends in letters, e.g. 15956323b) are queued with the
-- path the collector requests, /shop/p/-<code>/ (DECISIONS.md 2026-11-03), but the 0006 check only allowed short-link
-- paths: every such insert failed and the visitor saw «Что-то пошло не так» (found 9 Nov 2026 with the owner's coat
-- link from the Kaspi app). The check now allows both forms, nothing else.
alter table short_link_queue drop constraint short_link_queue_path_check;
alter table short_link_queue add constraint short_link_queue_path_check
  check (path ~ '^/(shop/)?[A-Za-z0-9_-]{4,64}$' or path ~ '^/shop/p/-[0-9]{5,12}[a-z]{1,3}/$');
