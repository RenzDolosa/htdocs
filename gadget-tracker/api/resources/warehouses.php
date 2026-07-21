<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/crud.php';

// Settings → Warehouse Information's tree lists sites oldest-first — see
// js/app.js's ApiStore instantiation, which requests ascending order to
// match (mirrors the old warehouseStore's `ascending: true` override).
handle_crud($pdo, 'warehouses', [
  'id' => 'string',
  'warehouseCode' => 'string',
  'name' => 'string',
  'operationMode' => 'string',
  'shortName' => 'string',
  'currency' => 'string',
  'country' => 'string',
  'region' => 'string',
  'city' => 'string',
  'barangay' => 'string',
  'fullAddress' => 'string',
  'contactPerson' => 'string',
  'publicHomePage' => 'bool',
  'phoneNumber' => 'string',
  'email' => 'string',
  'zipCode' => 'string',
  'areaPriority' => 'string',
  'createdAt' => 'int',
  'updatedAt' => 'int',
], 'id', 'createdAt', 'ASC');