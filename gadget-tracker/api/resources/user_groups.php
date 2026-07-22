<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/crud.php';

handle_crud($pdo, 'user_groups', [
  'id' => 'string',
  'groupNumber' => 'string',
  'name' => 'string',
  'enabled' => 'bool',
  'permissions' => 'json',
  'boundWarehouseIds' => 'json',
  'createdAt' => 'int',
  'updatedAt' => 'int',
  'history' => 'json',
], 'id', 'createdAt', 'DESC');