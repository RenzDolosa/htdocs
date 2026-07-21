<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/crud.php';

handle_crud($pdo, 'inventory_assets', [
  'id' => 'string',
  'category' => 'string',
  'serialNumber' => 'string',
  'assetTag' => 'string',
  'macAddress' => 'string',
  'imei1' => 'string',
  'imei2' => 'string',
  'createdAt' => 'int',
], 'id', 'createdAt', 'DESC');