-- Email alerts for watchers (DECISIONS.md, 2026-11-02 "Email alerts with confirmation"). An address receives alerts
-- only after its owner clicks the confirmation link (double opt-in). Only the SHA-256 of the confirmation token is
-- stored. email_stop_code is the unsubscribe code in every email (List-Unsubscribe); it changes with the address.
alter table watchers add column email text check (email = lower(email) and length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table watchers add column email_confirmed_at timestamptz;
alter table watchers add column email_token_hash text unique check (email_token_hash ~ '^[0-9a-f]{64}$');
alter table watchers add column email_token_expires_at timestamptz;
alter table watchers add column email_requested_at timestamptz;
alter table watchers add column email_stop_code text unique check (email_stop_code ~ '^[A-Za-z0-9_-]{16,64}$');
alter table watchers add constraint watchers_email_confirmed check (email_confirmed_at is null or email is not null);
create index watchers_email_requests on watchers (email, email_requested_at) where email is not null;
