-- ============================================================================
-- Fixes: auth.users and public.user_accounts out of sync
-- ============================================================================
-- Symptom: an account shows up in Supabase → Authentication → Users, but not
-- in the app's Settings → User management → User list — e.g. renzeload@gmail.com
-- currently has no row in user_accounts at all.
--
-- Root cause: nothing wrong with the *code* — schema.sql's on_auth_user_created
-- trigger (and its one-time backfill insert, further down in that same file)
-- already handle this correctly for anyone who signs up from now on. This
-- account just predates that trigger actually being live against this
-- project, so nothing ever created its row. isAccountEnabled() fails open
-- when a row is missing (see its doc comment in js/core/Auth.js) specifically
-- so this situation doesn't lock anyone out — but it also means an account in
-- this state can't be disabled from Settings, since there's no row to
-- toggle. That's the actual risk here, not a login failure.
--
-- Safe to run as many times as you want — step 2 only inserts rows for
-- auth.users that still don't have a match, same guard as schema.sql's
-- own backfill.
-- ============================================================================

-- 1. DIAGNOSE — lists every auth.users row with no linked user_accounts row.
--    Run this first; confirm renzeload@gmail.com (and only accounts you
--    actually expect) shows up before running step 2.
select au.id, au.email, au.created_at, au.last_sign_in_at
from auth.users au
left join public.user_accounts ua on ua."authUserId" = au.id
where ua.id is null;

-- 2. FIX — creates the missing user_accounts row(s), linked and enabled,
--    for whatever step 1 found. Username defaults to the part of the email
--    before the @ (same fallback the trigger itself uses) since these
--    accounts signed up before a username was ever collected for them.
insert into public.user_accounts (
  id, "userNumber", username, "loginAccount", mail, enabled,
  "createdAt", "updatedAt", "lastLoginAt", "authUserId"
)
select
  'usr-' || replace(gen_random_uuid()::text, '-', ''),
  (floor(random() * 89999999) + 10000000)::text,
  coalesce(nullif(au.raw_user_meta_data ->> 'username', ''), split_part(au.email, '@', 1)),
  au.email,
  au.email,
  true,
  (extract(epoch from au.created_at) * 1000)::bigint,
  (extract(epoch from au.created_at) * 1000)::bigint,
  case when au.last_sign_in_at is not null then (extract(epoch from au.last_sign_in_at) * 1000)::bigint end,
  au.id
from auth.users au
left join public.user_accounts ua on ua."authUserId" = au.id
where ua.id is null;

-- 3. CONFIRM the ongoing-prevention trigger is actually installed and
--    enabled, so this can't quietly happen again for the *next* sign-up.
--    tgenabled should read 'O' (origin — i.e. on). If this returns zero
--    rows, schema.sql's trigger section hasn't been run against this
--    project at all and should be re-run in full.
select tgname, tgrelid::regclass as table_name, tgenabled
from pg_trigger
where tgname in ('on_auth_user_created', 'on_auth_user_login');
