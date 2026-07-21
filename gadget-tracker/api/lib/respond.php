<?php
/** Sends a JSON body with the given status code and stops execution. */
function respond($data, int $code = 200): void {
  http_response_code($code);
  echo json_encode($data);
  exit;
}

/** Shorthand for the common error-shape response. */
function respond_error(string $message, int $code = 400): void {
  respond(['error' => $message], $code);
}

/** Decodes the JSON request body into an assoc array (empty array if none/invalid). */
function request_body(): array {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

/** Current epoch milliseconds — matches the app's existing Date.now()-based timestamps. */
function now_ms(): int {
  return (int) round(microtime(true) * 1000);
}