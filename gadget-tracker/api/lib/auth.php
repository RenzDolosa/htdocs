<?php
/**
 * Two independent identities can call this API, matching the login
 * screen's two tabs:
 *   - Administrator: a real Supabase Auth account. This backend has no
 *     way to validate that JWT locally (it doesn't have Supabase's
 *     signing secret, and shouldn't), so it asks Supabase itself who the
 *     bearer token belongs to via GET /auth/v1/user — the same call any
 *     client would make, just from PHP instead of JS. No service-role key
 *     involved; this only confirms "this token is currently valid", the
 *     same trust level the token's own owner already has.
 *   - Employee: a plain PHP session, set by auth/employee_login.php after
 *     checking the SQL-stored password hash. No Supabase involved at all
 *     for employees, which is the entire point of this migration — it's
 *     what avoids Supabase Auth's email-sending rate limit no matter how
 *     many employees sign in.
 *
 * Every resource endpoint (resources/*.php) accepts either identity —
 * same "table-level, not per-role" permission model the app already had
 * under Supabase RLS (see the old supabase/schema.sql's own note on
 * this), not a new restriction introduced by this migration.
 */

/** @return array|null Supabase's own /auth/v1/user response, or null if the token is missing/invalid. */
function verify_supabase_admin(): ?array {
  static $cached = false;
  if ($cached !== false) return $cached === null ? null : $cached;

  $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
  if (!preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
    $cached = null;
    return null;
  }
  $token = trim($m[1]);

  $ch = curl_init(rtrim(SUPABASE_URL, '/') . '/auth/v1/user');
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 8,
    CURLOPT_HTTPHEADER => [
      'apikey: ' . SUPABASE_ANON_KEY,
      'Authorization: Bearer ' . $token,
    ],
  ]);
  $body = curl_exec($ch);
  $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($status !== 200 || !$body) {
    $cached = null;
    return null;
  }
  $user = json_decode($body, true);
  $cached = is_array($user) ? $user : null;
  return $cached;
}

/** @return string|null The signed-in employee's user_accounts id, or null. */
function current_employee_id(): ?string {
  return $_SESSION['employee_id'] ?? null;
}

/** Requires a valid Administrator token; responds 401 and stops if absent. @return array Supabase user record. */
function require_admin(): array {
  $user = verify_supabase_admin();
  if (!$user) respond_error('Administrator sign-in required.', 401);
  return $user;
}

/** Requires a valid Employee session; responds 401 and stops if absent. @return string employee id. */
function require_employee(): string {
  $id = current_employee_id();
  if (!$id) respond_error('Employee sign-in required.', 401);
  return $id;
}

/**
 * Requires either identity — what every warehouse-data endpoint
 * (resources/*.php) uses. @return array{type:string, id:?string, user:?array}
 */
function require_any(): array {
  $employeeId = current_employee_id();
  if ($employeeId) return ['type' => 'employee', 'id' => $employeeId, 'user' => null];

  $admin = verify_supabase_admin();
  if ($admin) return ['type' => 'admin', 'id' => $admin['id'] ?? null, 'user' => $admin];

  respond_error('Sign-in required.', 401);
}