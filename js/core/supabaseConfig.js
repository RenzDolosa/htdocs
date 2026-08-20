/**
 * Supabase project credentials.
 *
 * The anon/public key is safe to ship to the browser — it's meant to be
 * public, the same way a Stripe publishable key or a Firebase web config
 * is. What actually gates access to your data is Row Level Security (RLS),
 * configured per-table in the Supabase dashboard, not this file.
 *
 * Never put the service_role key here, or anywhere client-side — that key
 * bypasses RLS entirely and belongs only on a trusted server.
 *
 * Fill these in from: Supabase dashboard → your project → Settings → API.
 */
export const SUPABASE_URL = 'https://ttoaqikahjckvukiohle.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0b2FxaWthaGpja3Z1a2lvaGxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MDE5NTUsImV4cCI6MjA5OTQ3Nzk1NX0.UdmKjc2ctsOoICn7w7uUatkXUuza3aQTP-GHHXBm0_I';

/**
 * "Login as Employee" (see js/core/EmployeeSession.js) verifies an
 * employee's password against the SQL-stored hash in
 * employee_credentials — never against Supabase Auth, which is what
 * avoids the email rate limit "+ Add user" used to hit. But every table's
 * RLS policy still requires a real `authenticated` Supabase session (see
 * supabase/schema.sql's policy section) to read or write anything at all.
 *
 * So after a SQL password check succeeds, the client signs in to this one
 * fixed, shared Supabase Auth account purely to satisfy RLS — it's not
 * tied to any one person, every employee's browser signs in to the exact
 * same account. *Which* employee is actually at the keyboard is tracked
 * separately, client-side (see EmployeeSession.js) and is what history
 * entries / the top bar / "Prepared by" actually use — this account only
 * ever appears in Supabase's own auth logs, never in the app's UI.
 *
 * This means anyone who reads this password out of the page source could
 * sign in as the shared employee account directly — but that's not a new
 * hole this introduces: every employee already has an equally-privileged
 * `authenticated` session the moment they sign in normally, and RLS here
 * is table-level for every account regardless (see schema.sql's own
 * "table-level, not row-level" note). Treat this the same as the anon key
 * above: not a secret in the traditional sense, just a credential that
 * happens to grant the same access level everyone signed in already has.
 *
 * One-time setup (see AUTH_GUIDE.md's "Employee login" section): create
 * this exact account once via the app's own "Create account" tab (or the
 * Supabase dashboard), using this exact email — supabase/schema.sql's
 * functions hardcode it too (search for this address there), so if you
 * change it here, update it there as well. Any password works; nobody
 * ever types it by hand.
 *
 * MUST be an address no real person signs in with — it needs to be
 * textually distinct from every employee's own loginAccount, or the
 * trigger that's supposed to recognize "this is the portal account, skip
 * the normal directory-linking logic" (supabase/schema.sql,
 * handle_new_auth_user()) silently doesn't, and instead links/creates a
 * real directory row for it — which is exactly what happened with the
 * previous value here (qrpass.3pl@gmail.com), a real employee's own
 * login account. A Gmail "+" alias of an inbox you already control (as
 * below) is a reasonable way to get something both deliverable — so
 * Supabase can send it a confirmation email if your project requires one
 * — and guaranteed never to collide with a real person's plain address.
 */
export const EMPLOYEE_PORTAL_EMAIL = 'maria@gmail.com';
export const EMPLOYEE_PORTAL_PASSWORD = 'sample';