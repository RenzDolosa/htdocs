-- ============================================================================
-- Stockroom / Gadget tracker — Supabase schema
-- ----------------------------------------------------------------------------
-- Run this in: Supabase dashboard → SQL Editor → New query → paste → Run.
--
-- Design decisions (read before running):
--
-- 1. IDs stay TEXT, not UUID. The app already generates ids client-side
--    (see js/utils/id.js: "gadget-abc123xyz") before a record exists on the
--    server, and controllers use the id synchronously the moment
--    store.create() returns (e.g. SettingsController.js binding a freshly
--    created warehouse's id to a new location). Switching to server-generated
--    UUIDs would break that synchronous pattern across ~6 call sites.
--
-- 2. Column names stay camelCase, double-quoted, to match the JS models
--    field-for-field ("createdAt", "warehouseAssetTag", etc.). Postgres
--    lowercases unquoted identifiers, so every camelCase / reserved-word
--    column below is quoted. This means zero renaming/mapping code needed
--    between the JS objects and Supabase rows.
--
-- 3. Timestamps stay BIGINT epoch-ms (Date.now()), not timestamptz — the
--    app's whole formatting layer (js/utils/format.js) and history log
--    entries already work in epoch-ms. Converting to timestamptz would
--    ripple through fmtDate/fmtLocalDateTime and every history entry.
--
-- 4. history / permissions stay JSONB — same shape as the in-memory arrays
--    /objects today, so LogModal and UserGroup's permission tree need no
--    changes.
--
-- 5. RLS is enabled on every table, requiring the `authenticated` role —
--    i.e. a real signed-in Supabase Auth session (see js/features/auth/
--    AuthController.js and AUTH_GUIDE.md). Anonymous requests are rejected
--    outright. Every signed-in account can read/write every row for now;
--    see the policy comment below for how to narrow that further.
--
-- 6. user_accounts is linked to auth.users via an "authUserId" column plus
--    two triggers (see the "user_accounts ↔ auth.users linkage" section
--    below): one auto-creates a user_accounts row the moment someone
--    signs up, the other keeps "lastLoginAt" fed from real sign-ins. Rows
--    added by hand via "+ Add user" stay unlinked (authUserId null) since
--    the client can't create a real Supabase Auth account for someone —
--    only their own sign-up can do that.
-- ============================================================================

-- Needed for gen_random_uuid() if you ever want it; harmless if already enabled.
-- Installed explicitly into `extensions` (Supabase's convention for
-- extensions, not `public`) — every SECURITY DEFINER function below that
-- calls crypt()/gen_salt() schema-qualifies the call AND lists `extensions`
-- in its own search_path, so this works regardless of whether pgcrypto was
-- already sitting in `public` or `extensions` from an earlier partial run.
create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- warehouses  (Settings → Warehouse Information)
-- ----------------------------------------------------------------------------
create table if not exists public.warehouses (
  id                text primary key,
  "warehouseCode"   text,
  name              text not null,
  "operationMode"   text default 'self-operate',
  "shortName"       text default '',
  currency          text default 'PHP',
  country           text default 'Philippines',
  region            text default '',
  city              text default '',
  barangay          text default '',
  "fullAddress"     text default '',
  "contactPerson"   text default '',
  "publicHomePage"  boolean default true,
  "phoneNumber"     text default '',
  email             text default '',
  "zipCode"         text default '',
  "areaPriority"    text default '',
  "createdAt"       bigint not null,
  "updatedAt"       bigint not null
);

-- ----------------------------------------------------------------------------
-- warehouse_locations  (Settings → Warehouse Information → per-zone positions)
-- ----------------------------------------------------------------------------
create table if not exists public.warehouse_locations (
  id                text primary key,
  "warehouseId"     text references public.warehouses(id) on delete cascade,
  zone              text default 'main',
  area              text default '',
  "row"             text default '',
  "column"          text default '',
  layer             text default '',
  cell              text default '',
  "locationCode"    text default '',
  "positionNumber"  text default '',
  length            text default '',
  width             text default '',
  height            text default '',
  property          text default 'goods',
  enabled           boolean default true,
  "createdAt"       bigint not null
);

create index if not exists warehouse_locations_warehouse_idx on public.warehouse_locations ("warehouseId");

-- ----------------------------------------------------------------------------
-- gadgets  (Manage tab — assigned equipment)
-- ----------------------------------------------------------------------------
create table if not exists public.gadgets (
  id                    text primary key,
  "user"                text default '',
  role                  text default '',
  category              text default 'Uncategorized',
  "serialNumber"        text default '',
  "warehouseAssetTag"   text default '',
  "assetTagDefault"     text default '',
  "macAddress"          text default '',
  password              text default '',
  merchant              text default '',
  owner                 text default '',
  remarks               text default '',
  description           text default '',
  "positionType"        text default '',
  warehouse             text default '',
  "temporaryPosition"   text default '',
  "createdAt"           bigint not null,
  "updatedAt"           bigint not null,
  history               jsonb default '[]'::jsonb
);

create index if not exists gadgets_serial_idx on public.gadgets ("serialNumber");

-- ----------------------------------------------------------------------------
-- inventory_assets  (Inventory Assets tab — raw stock, unassigned)
-- ----------------------------------------------------------------------------
create table if not exists public.inventory_assets (
  id              text primary key,
  category        text default '',
  "serialNumber"  text default '',
  "assetTag"      text default '',
  "macAddress"    text default '',
  imei1           text default '',
  imei2           text default '',
  "createdAt"     bigint not null
);

create index if not exists inventory_assets_serial_idx on public.inventory_assets ("serialNumber");

-- ----------------------------------------------------------------------------
-- user_accounts  (Settings → User management → User)
-- ----------------------------------------------------------------------------
create table if not exists public.user_accounts (
  id              text primary key,
  "userNumber"    text,
  username        text not null,
  "loginAccount"  text not null,
  "userGroup"     text default '',
  mail            text default '',
  "phoneNumber"   text default '',
  enabled         boolean default true,
  "createdAt"     bigint not null,
  "updatedAt"     bigint not null,
  "lastLoginAt"   bigint,
  history         jsonb default '[]'::jsonb
);

create unique index if not exists user_accounts_login_idx on public.user_accounts (lower("loginAccount"));

-- ----------------------------------------------------------------------------
-- user_accounts ↔ auth.users linkage
-- ----------------------------------------------------------------------------
-- Connects each User-management row to the real Supabase Auth account it
-- can sign in as, if any. This is the follow-on step AUTH_GUIDE.md flagged
-- as not yet done: previously user_accounts was a wholly separate,
-- hand-maintained directory with zero relationship to who could actually
-- log in — this makes signing up (js/features/auth/) and appearing here
-- the same event.
--
-- Rows added by hand via "+ Add user" keep "authUserId" null: there's no
-- real Supabase Auth account behind them (the client can't create one —
-- that needs either the person's own "Create account" sign-up or the
-- service-role key, which must never live in browser code), so they're
-- directory entries only until that email actually signs up.
alter table public.user_accounts add column if not exists "authUserId" uuid references auth.users(id) on delete set null;
create unique index if not exists user_accounts_auth_user_idx on public.user_accounts ("authUserId") where "authUserId" is not null;

-- Fires the moment someone signs up (supabase.auth.signUp — see
-- js/core/Auth.js) and creates their user_accounts row automatically,
-- pulling the username they typed on the sign-up screen (stored as auth
-- user_metadata, not its own column — see AuthController.js) and their
-- email. If a directory-only row for that same email already exists
-- (added by hand via "+ Add user" before this person had a real account),
-- that row is linked instead of a new one being created. SECURITY DEFINER
-- because the person signing up has no session yet at the instant this
-- runs, so it must bypass user_accounts' own "authenticated" RLS policy
-- to write at all.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1));
  v_now bigint := (extract(epoch from new.created_at) * 1000)::bigint;
begin
  -- The employee-portal service account (see "Employee (SQL-only) login"
  -- below) is a real auth.users row, but it isn't a person — it exists
  -- only so employee sign-ins can get a valid `authenticated` session
  -- after verify_employee_login() checks their SQL-stored password. Skip
  -- creating a directory entry for it; the real employee row (keyed by
  -- their own id, not this account's) already exists from "+ Add user".
  if new.email = 'qrpass.3pl+portal@gmail.com' then
    return new;
  end if;

  -- If a directory-only row already exists for this email (added by hand
  -- via "+ Add user" before this person had a real account — see
  -- UserAccountController.js), link it instead of inserting a duplicate.
  -- user_accounts has a unique index on lower("loginAccount"), so a plain
  -- insert here would violate it and abort this whole sign-up.
  update public.user_accounts
  set "authUserId" = new.id, username = v_username, "updatedAt" = v_now
  where lower("loginAccount") = lower(new.email) and "authUserId" is null;

  if not found then
    -- The ON CONFLICT target below must repeat the partial index's WHERE
    -- clause (line ~181) — Postgres won't match a plain "ON CONFLICT
    -- (col)" against a *partial* unique index without it, and errors with
    -- "no unique or exclusion constraint matching the ON CONFLICT
    -- specification" instead. That error surfaced to users as Supabase's
    -- generic "Database error creating new user" on every genuinely-new
    -- sign-up (dashboard or app) — nothing to do with the data being
    -- inserted, purely this clause not matching the index it targets.
    insert into public.user_accounts (
      id, "userNumber", username, "loginAccount", mail, enabled,
      "createdAt", "updatedAt", "authUserId"
    )
    values (
      'usr-' || replace(gen_random_uuid()::text, '-', ''),
      (floor(random() * 89999999) + 10000000)::text,
      v_username,
      new.email,
      new.email,
      true,
      v_now,
      v_now,
      new.id
    )
    on conflict ("authUserId") where "authUserId" is not null do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Keeps the "Last Login" column (already in the UI, previously always
-- blank — nothing ever set it) fed from Supabase Auth's own record of
-- sign-ins, rather than the app trying to track that itself.
create or replace function public.handle_auth_user_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_accounts
  set "lastLoginAt" = (extract(epoch from new.last_sign_in_at) * 1000)::bigint
  where "authUserId" = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_login on auth.users;
create trigger on_auth_user_login
  after update of last_sign_in_at on auth.users
  for each row
  when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function public.handle_auth_user_login();

-- One-time backfill: links accounts that signed up before this trigger
-- existed (anyone already using the app, including whoever's running this
-- script). Safe to re-run — on_auth_user_created's own on-conflict guard,
-- plus this query only targeting auth.users with no linked row yet, means
-- nothing gets duplicated on a second run.
insert into public.user_accounts (
  id, "userNumber", username, "loginAccount", mail, enabled, "createdAt", "updatedAt", "lastLoginAt", "authUserId"
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

-- ----------------------------------------------------------------------------
-- Employee (SQL-only) login — avoids Supabase Auth's email rate limit
-- ----------------------------------------------------------------------------
-- Problem this solves: every "+ Add user" used to call supabase.auth.signUp()
-- (see the old adminCreateAccount() in js/core/Auth.js), which — even with
-- "Confirm email" off — still counts against Supabase's email-sending rate
-- limit (a few per hour on the default/free SMTP config). Adding more than
-- a handful of staff in one sitting hits that limit fast, and it has
-- nothing to do with how many people actually need real admin-level
-- Supabase Auth accounts.
--
-- Fix: two account tiers, matching the login screen's two tabs.
--   • Administrator — a real Supabase Auth account (auth.users), created
--     only via the login screen's own "Create account" tab (self-service,
--     one email at signup time — see admin_account_exists() below for why
--     that tab disappears after the first one exists). Signs in with
--     supabase.auth.signInWithPassword(); nothing here changes that path.
--   • Employee — a row in user_accounts with a password hashed *in
--     Postgres* (pgcrypto's crypt()/gen_salt()) and stored in the
--     employee_credentials table below. Created by "+ Add user" writing
--     directly to these two tables — no Supabase Auth call, no email, no
--     rate limit, no matter how many get added. verify_employee_login()
--     checks the password; on success the client then signs in to one
--     fixed, shared "employee portal" Supabase Auth account (see
--     AUTH_GUIDE.md's "Employee login" section for the one-time setup
--     step) purely to obtain a valid `authenticated` RLS session — the
--     app tracks *which* employee that really is separately (see
--     js/core/EmployeeSession.js), the same way UserAccount.authUserId
--     already separates "directory row" from "real sign-in".
--
-- employee_credentials is a separate table, not a "passwordHash" column on
-- user_accounts, so that a plain `select * from user_accounts` (which
-- every signed-in account can run, admin or employee — RLS here is
-- table-level, see the policy section below) never has a hash to leak in
-- the first place. This table gets no ordinary RLS policy at all — the
-- only way in or out is through the two SECURITY DEFINER functions below,
-- which bypass RLS as their owner.
create table if not exists public.employee_credentials (
  "userAccountId" text primary key references public.user_accounts(id) on delete cascade,
  "passwordHash"  text not null,
  "updatedAt"     bigint not null
);
alter table public.employee_credentials enable row level security;
-- Deliberately no policies — see the comment above. RLS with zero
-- policies means "no direct access for anyone", by design.

-- Lets the (signed-out) login screen decide whether to show "Create
-- account" at all: per this feature's whole premise, that tab should only
-- ever create the *first* administrator. Runs as anon (grant below), so it
-- can't just query auth.users directly — anon has no access to that
-- schema — hence SECURITY DEFINER. The employee-portal service account
-- itself is excluded, or the very act of setting that account up would
-- permanently hide "Create account" even with zero real administrators.
create or replace function public.admin_account_exists()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users
    where email <> 'qrpass.3pl+portal@gmail.com'
  );
$$;
grant execute on function public.admin_account_exists() to anon;

-- Verifies an employee's SQL-stored password and returns just enough of
-- their directory row for the client to show who's signed in and stamp
-- history entries — never the hash, never anything from other rows.
-- Returns zero rows on any failure (unknown login, wrong password,
-- disabled account, or no credentials set yet) rather than distinguishing
-- which, same reasoning as Supabase Auth's own generic "Invalid login
-- credentials" — specific failure reasons make account enumeration easier.
-- anon-callable (grant below): this *is* the login step, so it has to work
-- before any session exists.
create or replace function public.verify_employee_login(p_login_account text, p_password text)
returns table (id text, username text, "userGroup" text, mail text)
language sql
security definer
set search_path = public, extensions
as $$
  select ua.id, ua.username, ua."userGroup", ua.mail
  from public.user_accounts ua
  join public.employee_credentials ec on ec."userAccountId" = ua.id
  where lower(ua."loginAccount") = lower(p_login_account)
    and ua.enabled = true
    and ec."passwordHash" = extensions.crypt(p_password, ec."passwordHash");
$$;
grant execute on function public.verify_employee_login(text, text) to anon;

-- Sets (or replaces) an employee's SQL-stored password — what "+ Add
-- user" / the edit modal call instead of the old adminCreateAccount()
-- signUp(). `to authenticated` rather than anon: only someone already
-- signed in (as an administrator or another employee — this app's RLS is
-- table-level, not per-role, same limitation AUTH_GUIDE.md already notes
-- for every other table) can call this. gen_salt('bf') is bcrypt, the
-- same algorithm family Supabase Auth itself uses for auth.users.
create or replace function public.set_employee_password(p_login_account text, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id text;
begin
  select id into v_user_id from public.user_accounts where lower("loginAccount") = lower(p_login_account);
  if v_user_id is null then
    raise exception 'No user_accounts row for login account %', p_login_account;
  end if;

  insert into public.employee_credentials ("userAccountId", "passwordHash", "updatedAt")
  values (v_user_id, extensions.crypt(p_new_password, extensions.gen_salt('bf')), (extract(epoch from now()) * 1000)::bigint)
  on conflict ("userAccountId") do update
    set "passwordHash" = excluded."passwordHash", "updatedAt" = excluded."updatedAt";
end;
$$;
grant execute on function public.set_employee_password(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- user_groups  (Settings → User management → User group)
-- ----------------------------------------------------------------------------
create table if not exists public.user_groups (
  id              text primary key,
  "groupNumber"   text,
  name            text not null,
  enabled         boolean default true,
  permissions     jsonb default '{}'::jsonb,
  "createdAt"     bigint not null,
  "updatedAt"     bigint not null,
  history         jsonb default '[]'::jsonb
);

create unique index if not exists user_groups_name_idx on public.user_groups (lower(name));

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.warehouses           enable row level security;
alter table public.warehouse_locations  enable row level security;
alter table public.gadgets              enable row level security;
alter table public.inventory_assets     enable row level security;
alter table public.user_accounts        enable row level security;
alter table public.user_groups          enable row level security;

-- Now that the app has real Supabase Auth (see js/features/auth/), require
-- a signed-in session for every operation on every table. This replaces an
-- earlier draft of this schema that allowed the `anon` role too — that was
-- only ever a placeholder for "no login exists yet"; now one does.
--
-- This is table-level only: any signed-in account can read/write every
-- row in every table. If you later need per-warehouse or per-role
-- restrictions (enforcing UserGroup.permissions server-side, not just
-- hiding menu items in the UI), tighten the `using`/`with check` clauses
-- below — e.g. `using (auth.uid() = "someOwnerColumn")`.
do $$
declare
  t text;
begin
  foreach t in array array['warehouses','warehouse_locations','gadgets','inventory_assets','user_accounts','user_groups']
  loop
    execute format('drop policy if exists "allow_all_anon" on public.%I;', t);
    execute format('drop policy if exists "authenticated_read_write" on public.%I;', t);
    execute format(
      'create policy "authenticated_read_write" on public.%I for all to authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;

-- ============================================================================
-- Realtime (optional, but recommended for a multi-user warehouse tool so
-- one staff member's changes show up for everyone else without a manual
-- refresh — SupabaseStore.js subscribes to these automatically).
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['warehouses','warehouse_locations','gadgets','inventory_assets','user_accounts','user_groups']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception when duplicate_object then
      -- already added on a previous run of this script — fine, skip it.
      null;
    end;
  end loop;
end $$;