<?php
/**
 * One generic handler behind every resources/*.php file, so each of those
 * files is just "here's my table name and column list" rather than
 * six copies of the same GET/POST/PUT/DELETE plumbing. Mirrors
 * SupabaseStore.js's shape on purpose: list (optionally filtered),
 * get-by-id, create, update-by-id, delete-by-id — same verbs the old
 * Postgres/RLS backend supported, just spoken over plain REST now instead
 * of the Supabase SDK.
 *
 * $columns is ['columnName' => 'string'|'int'|'bool'|'json', ...] — used
 * to (a) whitelist which columns can ever appear in a query (nothing from
 * the request body/URL is trusted as a raw identifier), and (b) cast
 * values correctly in both directions (MySQL's TINYINT(1) booleans and
 * JSON-as-TEXT columns don't round-trip through PDO as JS-shaped values
 * on their own).
 */

function handle_crud(PDO $pdo, string $table, array $columns, string $idColumn = 'id', string $orderBy = 'createdAt', string $orderDir = 'DESC'): void {
  require_any();

  $method = $_SERVER['REQUEST_METHOD'];
  $id = $_GET['id'] ?? null;

  switch ($method) {
    case 'GET':
      if ($id) {
        $row = crud_fetch_one($pdo, $table, $idColumn, $id, $columns);
        if (!$row) respond_error('Not found.', 404);
        respond(crud_decode($row, $columns));
        return;
      }
      $rows = crud_fetch_list($pdo, $table, $columns, $orderBy, $orderDir);
      respond(array_map(fn($r) => crud_decode($r, $columns), $rows));
      return;

    case 'POST':
      $data = request_body();
      if (empty($data[$idColumn])) respond_error("\"$idColumn\" is required.", 400);
      $row = crud_insert($pdo, $table, $columns, $idColumn, $data);
      respond(crud_decode($row, $columns), 201);
      return;

    case 'PUT':
    case 'PATCH':
      if (!$id) respond_error('id query parameter is required.', 400);
      $data = request_body();
      $row = crud_update($pdo, $table, $columns, $idColumn, $id, $data);
      if (!$row) respond_error('Not found.', 404);
      respond(crud_decode($row, $columns));
      return;

    case 'DELETE':
      if (!$id) {
        // Explicit opt-in flag rather than "no id = delete everything" by
        // default — that default would make a malformed request
        // dangerously destructive. Used by "Clear all data" (Manage /
        // Inventory Assets) — see js/core/ApiStore.js clear().
        if (($_GET['all'] ?? '') !== '1') respond_error('id query parameter is required (or pass all=1 to clear the table).', 400);
        $count = crud_delete_all($pdo, $table);
        respond(['deleted' => true, 'count' => $count]);
        return;
      }
      $ok = crud_delete($pdo, $table, $idColumn, $id);
      if (!$ok) respond_error('Not found.', 404);
      respond(['deleted' => true]);
      return;

    default:
      respond_error('Method not allowed.', 405);
  }
}

function crud_fetch_one(PDO $pdo, string $table, string $idColumn, string $id, array $columns): ?array {
  $cols = implode(',', array_map(fn($c) => "`$c`", array_keys($columns)));
  $stmt = $pdo->prepare("SELECT $cols FROM `$table` WHERE `$idColumn` = :id LIMIT 1");
  $stmt->execute(['id' => $id]);
  $row = $stmt->fetch();
  return $row ?: null;
}

/** Optional filters: any ?columnName=value query param matching a whitelisted column narrows the results — substring match for strings, exact match otherwise. Mirrors the search boxes already in the Settings/Manage screens. */
function crud_fetch_list(PDO $pdo, string $table, array $columns, string $orderBy, string $orderDir): array {
  $where = [];
  $params = [];
  foreach ($_GET as $key => $value) {
    if ($key === 'id' || $value === '' || !array_key_exists($key, $columns)) continue;
    $type = $columns[$key];
    if ($type === 'string') {
      $where[] = "`$key` LIKE :$key";
      $params[$key] = '%' . $value . '%';
    } elseif ($type === 'bool') {
      $where[] = "`$key` = :$key";
      $params[$key] = ($value === '1' || $value === 'true') ? 1 : 0;
    } else {
      $where[] = "`$key` = :$key";
      $params[$key] = $value;
    }
  }

  $cols = implode(',', array_map(fn($c) => "`$c`", array_keys($columns)));
  $sql = "SELECT $cols FROM `$table`";
  if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
  $dir = strtoupper($orderDir) === 'ASC' ? 'ASC' : 'DESC';
  if (array_key_exists($orderBy, $columns)) $sql .= " ORDER BY `$orderBy` $dir";

  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  return $stmt->fetchAll();
}

function crud_insert(PDO $pdo, string $table, array $columns, string $idColumn, array $data): array {
  $fields = [];
  $placeholders = [];
  $params = [];
  foreach ($columns as $col => $type) {
    if (!array_key_exists($col, $data)) continue;
    $fields[] = "`$col`";
    $placeholders[] = ":$col";
    $params[$col] = crud_encode_value($data[$col], $type);
  }
  $sql = "INSERT INTO `$table` (" . implode(',', $fields) . ') VALUES (' . implode(',', $placeholders) . ')';
  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  return crud_fetch_one($pdo, $table, $idColumn, $data[$idColumn], $columns);
}

function crud_update(PDO $pdo, string $table, array $columns, string $idColumn, string $id, array $data): ?array {
  $existing = crud_fetch_one($pdo, $table, $idColumn, $id, $columns);
  if (!$existing) return null;

  $sets = [];
  $params = ['__id' => $id];
  foreach ($columns as $col => $type) {
    if (!array_key_exists($col, $data) || $col === $idColumn) continue;
    $sets[] = "`$col` = :$col";
    $params[$col] = crud_encode_value($data[$col], $type);
  }
  if ($sets) {
    $sql = "UPDATE `$table` SET " . implode(',', $sets) . " WHERE `$idColumn` = :__id";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
  }
  return crud_fetch_one($pdo, $table, $idColumn, $id, $columns);
}

function crud_delete(PDO $pdo, string $table, string $idColumn, string $id): bool {
  $stmt = $pdo->prepare("DELETE FROM `$table` WHERE `$idColumn` = :id");
  $stmt->execute(['id' => $id]);
  return $stmt->rowCount() > 0;
}

function crud_delete_all(PDO $pdo, string $table): int {
  $stmt = $pdo->query("DELETE FROM `$table`");
  return $stmt->rowCount();
}

/** JS value -> MySQL-storable value. */
function crud_encode_value($value, string $type) {
  if ($value === null) return null;
  if ($type === 'json') return json_encode($value);
  if ($type === 'bool') return $value ? 1 : 0;
  return $value;
}

/** MySQL row (all strings/ints from PDO) -> JS-shaped value per column's declared type. Iterates the whitelist, not the raw row, so a column absent from $columns (e.g. user_accounts.passwordHash) can never end up in a response even if a future change to crud_fetch_* ever widened the SELECT. */
function crud_decode(array $row, array $columns): array {
  $out = [];
  foreach ($columns as $key => $type) {
    if (!array_key_exists($key, $row)) continue;
    $value = $row[$key];
    if ($value === null) { $out[$key] = null; continue; }
    switch ($type) {
      case 'bool': $out[$key] = (bool) (int) $value; break;
      case 'int':  $out[$key] = (int) $value; break;
      case 'json': $out[$key] = json_decode($value, true) ?? []; break;
      default:     $out[$key] = $value;
    }
  }
  return $out;
}