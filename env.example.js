/**
 * Template for env.js — this project's ".env" equivalent (see env.js's
 * own doc comment for why it's a script, not a real .env file).
 *
 * Setup:
 *   1. Copy this file to env.js (same folder — that exact name, it's
 *      what index.html loads and what .gitignore excludes).
 *   2. Fill in SUPABASE_URL / SUPABASE_ANON_KEY from your Supabase
 *      dashboard: your project → Settings → API.
 *
 * The anon/public key is safe to ship to the browser — it's meant to be
 * public, the same way a Stripe publishable key or a Firebase web config
 * is. What actually gates access to your data is Row Level Security
 * (RLS), configured per-table in the Supabase dashboard (see
 * supabase/schema.sql), not this file. Never put the service_role key
 * here, or anywhere client-side — that key bypasses RLS entirely and
 * belongs only on a trusted server.
 */
window.__ENV__ = {
  SUPABASE_URL: 'https://YOUR-PROJECT-REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-KEY'
};
