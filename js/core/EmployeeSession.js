/**
 * "Login as Employee" (see js/features/auth/) verifies a person's
 * password against employee_credentials in SQL, then signs their browser
 * into one fixed, shared Supabase Auth account (EMPLOYEE_PORTAL_EMAIL in
 * supabaseConfig.js) just to get a valid `authenticated` session for RLS.
 * Supabase's own session — `session.user.id/email` — is therefore the
 * *same value for every employee* and useless for "who is this really".
 *
 * This module is the answer to that: the real employee's directory row
 * (id, username, userGroup, mail — exactly what verify_employee_login()
 * returns, never a password or hash) gets stashed here right after that
 * RPC succeeds, and read back by AuthController on every subsequent
 * session-change (including page reloads, where Supabase silently
 * restores the persisted employee-portal session but this module's own
 * storage is what says whose session it actually is).
 *
 * Same persistence pattern as Operator.js (plain localStorage, one key,
 * try/catch around private-browsing edge cases) — this effectively
 * replaces Operator's "self-reported name" for anyone who signs in this
 * way, the same migration path Operator.js's own doc comment predicted.
 */

const STORAGE_KEY = 'stockroom_employee_session_v1';

/** Call right after verify_employee_login() succeeds. */
export function setEmployeeProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (e) {
    // Losing this isn't worth surfacing an error for — worst case,
    // AuthController falls back to treating the session as unidentified
    // until the next successful employee sign-in.
  }
}

/** @returns {{id: string, username: string, userGroup: string, mail: string}|null} */
export function getEmployeeProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/** Call on sign-out, so a stale profile never gets attributed to whoever signs in next. */
export function clearEmployeeProfile() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // Nothing more to do if this fails too.
  }
}