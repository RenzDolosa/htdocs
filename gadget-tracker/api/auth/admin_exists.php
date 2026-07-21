<?php
require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond_error('Method not allowed.', 405);

// Deliberately public (no session/token required) — the signed-out login
// screen needs this to decide whether "Create account" should even be an
// option, before anyone is signed in. Only ever returns a boolean, never
// row data, so there's nothing here to lock down further.
$stmt = $pdo->query('SELECT EXISTS(SELECT 1 FROM user_accounts WHERE `authUserId` IS NOT NULL) AS found');
$row = $stmt->fetch();

respond(['exists' => (bool) (int) $row['found']]);