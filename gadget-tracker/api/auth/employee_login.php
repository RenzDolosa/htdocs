<?php
require_once __DIR__ . '/../config.php';

// The entire point of this migration: Employee sign-in never touches
// Supabase, so it never counts against its email-sending rate limit no
// matter how many employees exist or how often they sign in. This is the
// only place (besides employee_set_password.php) that ever reads/writes
// user_accounts.passwordHash — resources/user_accounts.php's generic CRUD
// endpoint deliberately excludes that column entirely.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_error('Method not allowed.', 405);

$body = request_body();
$loginAccount = trim($body['loginAccount'] ?? '');
$password = (string) ($body['password'] ?? '');
if ($loginAccount === '' || $password === '') respond_error('Login account and password are required.', 400);

$stmt = $pdo->prepare(
  'SELECT id, username, `userGroup`, mail, `loginAccount`, enabled, `passwordHash`
   FROM user_accounts WHERE LOWER(`loginAccount`) = LOWER(:login) LIMIT 1'
);
$stmt->execute(['login' => $loginAccount]);
$row = $stmt->fetch();

// Deliberately generic on every failure branch — same reasoning as
// Supabase Auth's own "Invalid login credentials": distinguishing "wrong
// password" from "unknown login" from "disabled account" from "no
// password set yet" makes it easier to enumerate valid logins.
if (!$row || !$row['passwordHash'] || !password_verify($password, $row['passwordHash']) || !((bool)(int)$row['enabled'])) {
  respond_error('Incorrect login account or password.', 401);
}

session_regenerate_id(true);
$_SESSION['employee_id'] = $row['id'];

$now = now_ms();
$pdo->prepare('UPDATE user_accounts SET `lastLoginAt` = :now WHERE id = :id')
  ->execute(['now' => $now, 'id' => $row['id']]);

respond([
  'id' => $row['id'],
  'username' => $row['username'],
  'userGroup' => $row['userGroup'],
  'mail' => $row['mail'],
  'loginAccount' => $row['loginAccount'],
]);