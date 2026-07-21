<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/crud.php';

handle_crud($pdo, 'gadgets', [
  'id' => 'string',
  'user' => 'string',
  'role' => 'string',
  'category' => 'string',
  'serialNumber' => 'string',
  'warehouseAssetTag' => 'string',
  'assetTagDefault' => 'string',
  'macAddress' => 'string',
  'password' => 'string',
  'merchant' => 'string',
  'owner' => 'string',
  'remarks' => 'string',
  'description' => 'string',
  'positionType' => 'string',
  'warehouse' => 'string',
  'temporaryPosition' => 'string',
  'createdAt' => 'int',
  'updatedAt' => 'int',
  'history' => 'json',
], 'id', 'createdAt', 'DESC');