<?php
/**
 * Bootstrap included by every endpoint. Handles, in order: CORS (must run
 * before session_start()'s cookie is sent), the PHP session (Employee
 * login lives entirely in this — see auth/employee_login.php), and the
 * MySQL connection every resource endpoint uses.
 *
 * XAMPP setup: copy this whole `api/` folder into htdocs (e.g.
 * C:\xampp\htdocs\gadget-tracker\api), create the database in phpMyAdmin,
 * import schema.sql, then fill in the constants below. See
 * PHP_XAMPP_GUIDE.md for the full walkthrough.
 */

// ---------------------------------------------------------------------------
// Edit these for your setup
// ---------------------------------------------------------------------------
const DB_HOST = '127.0.0.1';
const DB_NAME = 'gadget_tracker';
const DB_USER = 'root';
const DB_PASS = '';           // XAMPP's default MySQL root password is empty
const DB_PORT = '3306';

// Origin the frontend is served from. XAMPP's own htdocs (e.g.
// http://localhost/gadget-tracker) is simplest — same-origin means the
// browser doesn't even need to send cookies cross-site. If you serve the
// frontend elsewhere (a separate dev server, a different port), put that
// exact origin here — CORS with credentials cannot use "*".
const ALLOWED_ORIGIN = 'http://localhost';

// Administrators still sign in via real Supabase Auth (see
// js/core/Auth.js) — every admin-gated endpoint here verifies the
// caller's Supabase access token by asking Supabase itself who it belongs
// to (GET /auth/v1/user), rather than trying to validate the JWT locally.
// Same project/anon key as js/core/supabaseConfig.js — copy them here too.
const SUPABASE_URL = 'https://ttoaqikahjckvukiohle.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0b2FxaWthaGpja3Z1a2lvaGxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MDE5NTUsImV4cCI6MjA5OTQ3Nzk1NX0.UdmKjc2ctsOoICn7w7uUatkXUuza3aQTP-GHHXBm0_I';

// ---------------------------------------------------------------------------
// CORS — must happen before anything else touches output or the session
// ---------------------------------------------------------------------------
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin === ALLOWED_ORIGIN) {
  header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
  header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  // Preflight — no body, no session, nothing else to do.
  http_response_code(204);
  exit;
}

// ---------------------------------------------------------------------------
// Session (Employee login) — cookie must be readable cross-request but
// still credentials-scoped to this API's origin.
// ---------------------------------------------------------------------------
session_set_cookie_params([
  'lifetime' => 0,
  'path' => '/',
  'samesite' => 'Lax',
  'secure' => false, // set true once this is served over https
  'httponly' => true,
]);
session_start();

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
try {
  $pdo = new PDO(
    'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4',
    DB_USER,
    DB_PASS,
    [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES => false,
    ]
  );
} catch (PDOException $e) {
  http_response_code(500);
  echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
  exit;
}

require_once __DIR__ . '/lib/respond.php';
require_once __DIR__ . '/lib/auth.php';