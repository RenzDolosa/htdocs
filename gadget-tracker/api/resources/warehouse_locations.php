<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/crud.php';

handle_crud($pdo, 'warehouse_locations', [
  'id' => 'string',
  'warehouseId' => 'string',
  'zone' => 'string',
  'area' => 'string',
  'row' => 'string',
  'column' => 'string',
  'layer' => 'string',
  'cell' => 'string',
  'locationCode' => 'string',
  'positionNumber' => 'string',
  'length' => 'string',
  'width' => 'string',
  'height' => 'string',
  'property' => 'string',
  'enabled' => 'bool',
  'createdAt' => 'int',
], 'id', 'createdAt', 'DESC');