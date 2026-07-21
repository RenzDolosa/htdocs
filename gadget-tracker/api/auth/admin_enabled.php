<?php
require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond_error('Method not allowed.', 405);

$admin = require_admin();
$authUserId = $admin['id'] ?? null;

$stmt = $pdo->prepare('SELECT enabled FROM user_accounts WHERE `authUserId` = :authUserId LIMIT 1');
$stmt->execute(['authUserId' => $authUserId]);
$row = $stmt->fetch();

// No linked row at all (e.g. admin_sync hasn't run yet for this session) →
// fail OPEN, same reasoning as the old isAccountEnabled(): the absence of
// a row must never be indistinguishable from an explicit disable, or
// every account gets locked out the moment this check ships.
$enabled = $row ? (bool) (int) $row['enabled'] : true;

respond(['enabled' => $enabled]);