import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabase } from './supabaseClient.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, EMPLOYEE_PORTAL_EMAIL, EMPLOYEE_PORTAL_PASSWORD } from './supabaseConfig.js';

/**
 * Thin wrapper around supabase.auth. Kept separate from supabaseClient.js
 * (which only exports the raw client) so every other module talks to
 * "sign in" / "sign out" / "current session" as concepts, not to the
 * supabase-js SDK's specific method names — same reasoning as Store.js
 * hiding localStorage's API from the rest of the app.
 */

/** Current session, or null if signed out / not configured. */
export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[auth] getSession failed', error);
    return null;
  }
  return data.session;
}

/**
 * Fires immediately with the current session, then again on every
 * sign-in/sign-out/token-refresh. Returns an unsubscribe function.
 */
export function onAuthStateChange(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

/** @returns {Promise<{ session: object|null, error: object|null }>} */
export async function signInWithPassword(email, password) {
  if (!supabase) return { session: null, error: { message: 'Supabase is not configured.' } };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { session: data?.session || null, error };
}

/**
 * Creates a new account. Depending on your Supabase project's Auth settings
 * (Authentication → Providers → Email → "Confirm email"), this either
 * signs the person in immediately or requires an email confirmation click
 * first — `data.session` will be null in the latter case, which the caller
 * uses to show a "check your inbox" message instead of proceeding.
 *
 * `username` is stored as Supabase Auth user metadata (`user_metadata.username`,
 * i.e. `raw_user_meta_data->>'username'` in Postgres) rather than as its own
 * column — there's no separate profiles table, so the auth user itself is
 * the only place to hang a display name. It's what AuthController reads
 * back afterward to populate the top bar instead of the email address.
 */
export async function signUp(email, password, username) {
  if (!supabase) return { session: null, error: { message: 'Supabase is not configured.' } };
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username: (username || '').trim() } }
  });
  return { session: data?.session || null, needsEmailConfirmation: !data?.session && !error, error };
}

export async function signOut() {
  if (!supabase) return { error: null };
  const { error } = await supabase.auth.signOut();
  return { error };
}

/**
 * Changes the signed-in user's password. Supabase's `updateUser` trusts the
 * current session as proof of identity (no "current password" re-entry
 * needed) — same as most account-settings password changes. It updates the
 * password for this session immediately; it doesn't sign out other
 * sessions/tabs, which will just need the new password next time they sign
 * in.
 * @returns {Promise<{ error: object|null }>}
 */
export async function updatePassword(newPassword) {
  if (!supabase) return { error: { message: 'Supabase is not configured.' } };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error };
}

/**
 * Creates a brand-new Supabase Auth account on someone else's behalf —
 * used by Settings → User management → "+ Add user" to give that person
 * real sign-in credentials, not just a directory entry. The auth.users →
 * user_accounts trigger (see supabase/schema.sql) creates their linked
 * user_accounts row automatically once this succeeds.
 *
 * Calling `signUp()` on the app's normal shared client would sign the
 * *admin* out and into the new account — signUp always adopts the
 * resulting session on whichever client made the call. To avoid that,
 * this spins up a second, throwaway client with `persistSession: false`
 * / `autoRefreshToken: false`, so its session lives only in that
 * short-lived instance's own memory and never touches the localStorage
 * key the shared client reads its session from — the admin's session is
 * never touched.
 *
 * This still can't do everything the service-role key could (skip email
 * confirmation, set arbitrary fields) — that key must never live in
 * browser code. This is the closest safe equivalent from the client alone.
 * @returns {Promise<{ userId: string|null, needsEmailConfirmation: boolean, error: object|null }>}
 */
export async function adminCreateAccount({ email, password, username }) {
  if (!supabase) return { userId: null, needsEmailConfirmation: false, error: { message: 'Supabase is not configured.' } };
  const scratchClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data, error } = await scratchClient.auth.signUp({
    email,
    password,
    options: { data: { username: (username || '').trim() } }
  });
  return { userId: data?.user?.id || null, needsEmailConfirmation: !data?.session && !error, error };
}

/**
 * Sends a password-reset email to someone else's account — used from
 * Settings → User management's edit modal for accounts that are already
 * linked to a real sign-in (see UserAccount.authUserId). There's no
 * client-safe way to set another person's password directly; only the
 * service-role key can do that, and it must never live in browser code.
 * When they click the emailed link, they land back in the app already
 * signed in via a recovery session — Settings → General → Change
 * password (updatePassword() above) is what actually sets the new one.
 * @returns {Promise<{ error: object|null }>}
 */
export async function sendPasswordReset(email) {
  if (!supabase) return { error: { message: 'Supabase is not configured.' } };
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error };
}

/**
 * Checks whether Settings → User management → User has explicitly
 * disabled this account (the "Enable" toggle on each row / the "Enabled"
 * checkbox in its edit form — see UserAccountController.js). This is what
 * makes that toggle actually gate access instead of being a cosmetic
 * directory field: AuthController calls this on every sign-in and signs
 * the person straight back out if it comes back false.
 *
 * Returns true (allowed) whenever there's no linked user_accounts row at
 * all — not yet linked because supabase/schema.sql's trigger migration
 * hasn't been run, or a brand-new sign-up the trigger hasn't caught up
 * on yet, or any other reason this table doesn't have them. Only an
 * *existing* row with enabled = false blocks sign-in; its mere absence
 * never does. That's a deliberate fail-open — the alternative (treating
 * "no row" as "blocked") would lock every account out the moment this
 * feature ships, until the SQL migration and its backfill have actually
 * been run against the project.
 * @returns {Promise<boolean>}
 */
export async function isAccountEnabled(userId) {
  if (!supabase) return true;
  const { data, error } = await supabase.from('user_accounts').select('enabled').eq('authUserId', userId).maybeSingle();
  if (error) {
    console.error('[auth] isAccountEnabled check failed — allowing sign-in rather than risk locking everyone out', error);
    return true;
  }
  return data ? data.enabled !== false : true;
}

/**
 * True once at least one real administrator account exists (see
 * supabase/schema.sql's admin_account_exists() — it's the one place that
 * decides what counts, excluding the shared employee-portal account).
 * AuthController uses this to hide the "Create account" tab once it's no
 * longer the bootstrap step — after the first admin exists, every
 * subsequent account is either that admin signing in, or an employee
 * added through Settings → User management, never another self-service
 * admin sign-up.
 *
 * Fails "true" (hide the tab) rather than "false" on any error — if the
 * check itself is broken, defaulting to *more* permissive self-signup is
 * the worse failure mode of the two.
 */
export async function adminAccountExists() {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('admin_account_exists');
  if (error) {
    console.error('[auth] adminAccountExists check failed — hiding "Create account" rather than risk open self-signup', error);
    return true;
  }
  return !!data;
}

/**
 * "Login as Employee" step 1: checks the SQL-stored password (see
 * supabase/schema.sql's verify_employee_login — pgcrypto crypt(), never
 * touches Supabase Auth, so this never counts against the email rate
 * limit no matter how many employees exist). Returns the matching
 * user_accounts row (id/username/userGroup/mail only — never a hash) on
 * success, or null on any failure: wrong password, unknown login,
 * disabled account, or an employee row with no password set yet. Those
 * are deliberately indistinguishable here for the same reason Supabase
 * Auth's own "Invalid login credentials" doesn't say which part was
 * wrong — telling them apart makes it easier to enumerate valid logins.
 * @returns {Promise<{profile: object|null, error: object|null}>}
 */
export async function verifyEmployeeLogin(loginAccount, password) {
  if (!supabase) return { profile: null, error: { message: 'Supabase is not configured.' } };
  const { data, error } = await supabase.rpc('verify_employee_login', {
    p_login_account: loginAccount,
    p_password: password
  });
  if (error) return { profile: null, error };
  return { profile: data?.[0] || null, error: null };
}

/**
 * "Login as Employee" step 2, called only after verifyEmployeeLogin()
 * above already confirmed the real password — this just signs the
 * browser into the one shared employee-portal account (see
 * supabaseConfig.js's EMPLOYEE_PORTAL_EMAIL/PASSWORD) so RLS sees a valid
 * `authenticated` session. AuthController pairs this with
 * EmployeeSession.setEmployeeProfile() so the app still shows/logs the
 * *real* person, not this shared account.
 * @returns {Promise<{ session: object|null, error: object|null }>}
 */
export async function signInToEmployeePortal() {
  if (EMPLOYEE_PORTAL_PASSWORD === 'CHANGE-ME-employee-portal-service-password') {
    // Fails before ever calling Supabase, with a message that actually says
    // what's wrong — the generic "could not connect" a real auth failure
    // shows here is indistinguishable from a network problem, and cost
    // real debugging time working out that this placeholder was the cause.
    return {
      session: null,
      error: {
        message: 'EMPLOYEE_PORTAL_PASSWORD in js/core/supabaseConfig.js is still the placeholder value — see AUTH_GUIDE.md\'s "Employee login" section to finish setup.'
      }
    };
  }
  return signInWithPassword(EMPLOYEE_PORTAL_EMAIL, EMPLOYEE_PORTAL_PASSWORD);
}

/**
 * Sets (or replaces) an employee's SQL-stored sign-in password — what
 * Settings → User management's "+ Add user" / edit-with-password calls
 * now instead of the old adminCreateAccount() above. No Supabase Auth
 * call, so no email, no rate limit, regardless of how many employees get
 * added in one sitting. Requires *some* signed-in session (RPC is granted
 * to `authenticated`, not `anon` — see schema.sql), same trust level as
 * every other write in this app.
 * @returns {Promise<{ error: object|null }>}
 */
export async function setEmployeePassword(loginAccount, newPassword) {
  if (!supabase) return { error: { message: 'Supabase is not configured.' } };
  const { error } = await supabase.rpc('set_employee_password', {
    p_login_account: loginAccount,
    p_new_password: newPassword
  });
  return { error };
}