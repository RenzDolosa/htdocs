// supabase/functions/delete-auth-user/index.ts
//
// Settings → User management → User's Delete action (see
// UserAccountController.js / core/Auth.js's deleteAuthUser()) calls this
// for any row with authUserId set — a real Administrator's Supabase Auth
// account. Deleting a user from Authentication → Users requires the
// service-role key, and that key must never live in browser code — this
// function is where it's allowed to live instead: Supabase injects
// SUPABASE_SERVICE_ROLE_KEY into every Edge Function's environment
// automatically, and it's never exposed to whatever calls this function
// over HTTP.
//
// Deploy once with the Supabase CLI (see AUTH_GUIDE.md's "Deleting a
// user's Supabase Auth account" section for the full walkthrough):
//   supabase functions deploy delete-auth-user
//
// Trust model: the caller must present their own, currently-valid
// Supabase Auth access token (the anon-key client checks that below) —
// proving "a real signed-in session made this request", the same trust
// level every other write in this app already requires. It does *not*
// separately check "is this specifically an administrator", because
// nothing else in the app does either — see AuthController.js's own
// header comment on why there's no more admin-only gating anywhere.
// Refuses to delete the caller's own account either way, so nobody can
// accidentally lock themselves out through this path.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Edge Function is missing its Supabase environment variables.' }, 500);
  }

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign-in required.' }, 401);

  // Verifies the *caller's* token the same way any client-side
  // getVerifiedUser() call would — using the public anon key, not the
  // service-role one, so this step alone grants no elevated access.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData?.user) return json({ error: 'Sign-in required.' }, 401);

  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }
  const targetUserId = body.userId;
  if (!targetUserId) return json({ error: '"userId" is required.' }, 400);

  if (targetUserId === callerData.user.id) {
    return json({ error: "You can't delete your own account while signed in as it." }, 400);
  }

  // Only past this point does the service-role key ever get used — and
  // only for this one call, never anything reachable from the request
  // itself.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
  if (deleteError) return json({ error: deleteError.message }, 400);

  return json({ success: true });
});
