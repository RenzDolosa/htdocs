<?php
require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond_error('Method not allowed.', 405);
require_admin(); // only a signed-in Administrator can set someone else's password

$body = request_body();
$id = trim($body['id'] ?? '');
$password = (string) ($body['password'] ?? '');
if ($id === '' || strlen($password) < 6) respond_error('A user id and a password of at least 6 characters are required.', 400);

$exists = $pdo->prepare('SELECT id FROM user_accounts WHERE id = :id LIMIT 1');
$exists->execute(['id' => $id]);
if (!$exists->fetch()) respond_error('Not found.', 404);

$hash = password_hash($password, PASSWORD_BCRYPT);
$pdo->prepare('UPDATE user_accounts SET `passwordHash` = :hash, `updatedAt` = :now WHERE id = :id')
  ->execute(['hash' => $hash, 'now' => now_ms(), 'id' => $id]);

respond(['ok' => true]);