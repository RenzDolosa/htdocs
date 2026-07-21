<?php
require_once __DIR__ . '/../config.php';

/**
 * Supabase Auth itself has no idea MySQL's user_accounts table exists, so
 * unlike the old Postgres version (a trigger on auth.users), there's
 * nothing server-side to fire this automatically. Instead, AuthController
 * calls this every time an Administrator session is confirmed (sign-up,
 * sign-in, page-load restore) — idempotent, so calling it repeatedly for
 * the same account just keeps `lastLoginAt` fresh and does nothing else.
 *
 * Trusts the Supabase-verified token (require_admin()) for id/email/
 * username — never anything the client asserts directly — same as the
 * old trigger trusted `new.id`/`new.email`/`new.raw_user_meta_data`
 * rather than anything from the request body.
 */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_error('Method not allowed.', 405);

$admin = require_admin();
$authUserId = $admin['id'] ?? null;
$email = $admin['email'] ?? null;
if (!$authUserId || !$email) respond_error('Supabase account is missing an id/email.', 400);

$username = trim((string) ($admin['user_metadata']['username'] ?? ''));
if ($username === '') $username = explode('@', $email)[0];

$now = now_ms();

// Already linked — just keep lastLoginAt fresh (this is also what
// replaces the old on_auth_user_login trigger).
$stmt = $pdo->prepare('SELECT id FROM user_accounts WHERE `authUserId` = :authUserId LIMIT 1');
$stmt->execute(['authUserId' => $authUserId]);
$existing = $stmt->fetch();

if ($existing) {
  $pdo->prepare('UPDATE user_accounts SET `lastLoginAt` = :now WHERE id = :id')
    ->execute(['now' => $now, 'id' => $existing['id']]);
  respond(['id' => $existing['id'], 'linked' => true]);
}

// A directory-only row for this email may already exist (added by hand
// via "+ Add user" before this person had a real account) — claim it
// instead of inserting a duplicate, same reasoning as the old trigger's
// own "claim, don't collide with the unique loginAccount index" logic.
$stmt = $pdo->prepare('SELECT id FROM user_accounts WHERE LOWER(`loginAccount`) = LOWER(:email) AND `authUserId` IS NULL LIMIT 1');
$stmt->execute(['email' => $email]);
$unclaimed = $stmt->fetch();

if ($unclaimed) {
  $pdo->prepare('UPDATE user_accounts SET `authUserId` = :authUserId, username = :username, `updatedAt` = :now, `lastLoginAt` = :now WHERE id = :id')
    ->execute(['authUserId' => $authUserId, 'username' => $username, 'now' => $now, 'id' => $unclaimed['id']]);
  respond(['id' => $unclaimed['id'], 'linked' => true, 'claimed' => true]);
}

$id = 'usr-' . bin2hex(random_bytes(12));
$userNumber = (string) random_int(10000000, 99999999);
$pdo->prepare(
  'INSERT INTO user_accounts (id, `userNumber`, username, `loginAccount`, mail, enabled, `createdAt`, `updatedAt`, `lastLoginAt`, `authUserId`)
   VALUES (:id, :userNumber, :username, :email, :email, 1, :now, :now, :now, :authUserId)'
)->execute([
  'id' => $id, 'userNumber' => $userNumber, 'username' => $username,
  'email' => $email, 'now' => $now, 'authUserId' => $authUserId,
]);

respond(['id' => $id, 'linked' => true, 'created' => true], 201);