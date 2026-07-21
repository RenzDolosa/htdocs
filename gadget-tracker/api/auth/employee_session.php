<?php
require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond_error('Method not allowed.', 405);

$id = current_employee_id();
if (!$id) respond_error('No employee session.', 401);

// Re-fetch rather than trust anything cached in the session itself — an
// administrator may have disabled or edited this row since the cookie
// was issued, and that has to take effect on the very next check, not
// just the next explicit sign-in.
$stmt = $pdo->prepare('SELECT id, username, `userGroup`, mail, `loginAccount`, enabled FROM user_accounts WHERE id = :id LIMIT 1');
$stmt->execute(['id' => $id]);
$row = $stmt->fetch();

if (!$row || !((bool)(int)$row['enabled'])) {
  // Account deleted or disabled mid-session — same as isAccountEnabled()
  // used to do for administrators, just enforced on the employee side now.
  $_SESSION = [];
  session_destroy();
  respond_error('This account is no longer available.', 401);
}

unset($row['enabled']);
respond($row);