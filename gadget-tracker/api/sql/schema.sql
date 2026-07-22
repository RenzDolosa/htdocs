-- ============================================================================
-- Gadget Tracker — MySQL schema (PHP/XAMPP backend)
-- ----------------------------------------------------------------------------
-- Import via phpMyAdmin (or `mysql -u root gadget_tracker < schema.sql`)
-- after creating an empty `gadget_tracker` database. See PHP_XAMPP_GUIDE.md
-- for the full setup walkthrough.
--
-- Column names stay camelCase, backtick-quoted, to match the JS models and
-- api/lib/crud.php's column whitelists field-for-field — same reasoning
-- the old Postgres schema used (zero renaming/mapping code between the JS
-- objects and API responses).
--
-- Timestamps stay BIGINT epoch-ms (Date.now()), matching js/utils/format.js
-- and every history log entry already in that shape.
--
-- IDs stay VARCHAR, not AUTO_INCREMENT/UUID — the app generates ids
-- client-side (js/utils/id.js) before a record exists on the server, and
-- uses that id synchronously the moment a create() call returns.
-- ============================================================================

SET NAMES utf8mb4;

-- ----------------------------------------------------------------------------
-- warehouses  (Settings → Warehouse Information)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warehouses (
  id               VARCHAR(64) PRIMARY KEY,
  warehouseCode    VARCHAR(64)  DEFAULT NULL,
  name             VARCHAR(190) NOT NULL,
  operationMode    VARCHAR(64)  DEFAULT 'self-operate',
  shortName        VARCHAR(64)  DEFAULT '',
  currency         VARCHAR(16)  DEFAULT 'PHP',
  country          VARCHAR(120) DEFAULT 'Philippines',
  region           VARCHAR(120) DEFAULT '',
  city             VARCHAR(120) DEFAULT '',
  barangay         VARCHAR(120) DEFAULT '',
  fullAddress      TEXT,
  contactPerson    VARCHAR(190) DEFAULT '',
  publicHomePage   TINYINT(1)   DEFAULT 1,
  phoneNumber      VARCHAR(64)  DEFAULT '',
  email            VARCHAR(190) DEFAULT '',
  zipCode          VARCHAR(32)  DEFAULT '',
  areaPriority     VARCHAR(190) DEFAULT '',
  createdAt        BIGINT NOT NULL,
  updatedAt        BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- warehouse_locations  (per-zone positions within a warehouse)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warehouse_locations (
  id               VARCHAR(64) PRIMARY KEY,
  warehouseId      VARCHAR(64) DEFAULT NULL,
  zone             VARCHAR(64)  DEFAULT 'main',
  area             VARCHAR(120) DEFAULT '',
  `row`            VARCHAR(32)  DEFAULT '',
  `column`         VARCHAR(32)  DEFAULT '',
  layer            VARCHAR(32)  DEFAULT '',
  cell             VARCHAR(32)  DEFAULT '',
  locationCode     VARCHAR(120) DEFAULT '',
  positionNumber   VARCHAR(64)  DEFAULT '',
  length           VARCHAR(32)  DEFAULT '',
  width            VARCHAR(32)  DEFAULT '',
  height           VARCHAR(32)  DEFAULT '',
  property         VARCHAR(32)  DEFAULT 'goods',
  enabled          TINYINT(1)   DEFAULT 1,
  createdAt        BIGINT NOT NULL,
  KEY warehouse_locations_warehouse_idx (warehouseId),
  CONSTRAINT fk_warehouse_locations_warehouse FOREIGN KEY (warehouseId) REFERENCES warehouses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- gadgets  (Manage tab — assigned equipment)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gadgets (
  id                  VARCHAR(64) PRIMARY KEY,
  `user`              VARCHAR(190) DEFAULT '',
  role                VARCHAR(120) DEFAULT '',
  category            VARCHAR(120) DEFAULT 'Uncategorized',
  serialNumber        VARCHAR(190) DEFAULT '',
  warehouseAssetTag   VARCHAR(190) DEFAULT '',
  assetTagDefault     VARCHAR(190) DEFAULT '',
  macAddress          VARCHAR(64)  DEFAULT '',
  password            VARCHAR(190) DEFAULT '',
  merchant            VARCHAR(190) DEFAULT '',
  owner               VARCHAR(190) DEFAULT '',
  remarks             TEXT,
  description         TEXT,
  positionType        VARCHAR(64)  DEFAULT '',
  warehouse           VARCHAR(190) DEFAULT '',
  temporaryPosition   VARCHAR(190) DEFAULT '',
  createdAt           BIGINT NOT NULL,
  updatedAt           BIGINT NOT NULL,
  history             JSON,
  KEY gadgets_serial_idx (serialNumber)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- inventory_assets  (Inventory Assets tab — raw stock, unassigned)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_assets (
  id             VARCHAR(64) PRIMARY KEY,
  category       VARCHAR(120) DEFAULT '',
  serialNumber   VARCHAR(190) DEFAULT '',
  assetTag       VARCHAR(190) DEFAULT '',
  macAddress     VARCHAR(64)  DEFAULT '',
  imei1          VARCHAR(32)  DEFAULT '',
  imei2          VARCHAR(32)  DEFAULT '',
  createdAt      BIGINT NOT NULL,
  KEY inventory_assets_serial_idx (serialNumber)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- user_accounts  (Settings → User management → User)
-- ----------------------------------------------------------------------------
-- Two account tiers, matching the login screen's two tabs:
--   • Administrator — authUserId holds the matching Supabase Auth user's
--     uuid (see api/auth/admin_sync.php, the client-triggered replacement
--     for the old Postgres trigger). passwordHash stays NULL for these —
--     they authenticate via Supabase, not this table.
--   • Employee — passwordHash holds a PHP password_hash() (bcrypt) value,
--     verified by api/auth/employee_login.php. authUserId stays NULL.
--
-- passwordHash is excluded from resources/user_accounts.php's column
-- whitelist entirely — the generic CRUD endpoint can never select,
-- return, or write it, no matter the verb. It's touched only by
-- employee_login.php and employee_set_password.php.
CREATE TABLE IF NOT EXISTS user_accounts (
  id             VARCHAR(64) PRIMARY KEY,
  userNumber     VARCHAR(32),
  username       VARCHAR(190) NOT NULL,
  loginAccount   VARCHAR(190) NOT NULL,
  userGroup      VARCHAR(190) DEFAULT '',
  mail           VARCHAR(190) DEFAULT '',
  phoneNumber    VARCHAR(64)  DEFAULT '',
  enabled        TINYINT(1)   DEFAULT 1,
  createdAt      BIGINT NOT NULL,
  updatedAt      BIGINT NOT NULL,
  lastLoginAt    BIGINT DEFAULT NULL,
  history        JSON,
  authUserId     VARCHAR(64) DEFAULT NULL,
  passwordHash   VARCHAR(255) DEFAULT NULL,
  UNIQUE KEY user_accounts_login_idx (loginAccount),
  UNIQUE KEY user_accounts_auth_user_idx (authUserId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- user_groups  (Settings → User management → User group)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_groups (
  id             VARCHAR(64) PRIMARY KEY,
  groupNumber    VARCHAR(32),
  name           VARCHAR(190) NOT NULL,
  enabled        TINYINT(1) DEFAULT 1,
  permissions    JSON,
  boundWarehouseIds JSON,
  createdAt      BIGINT NOT NULL,
  updatedAt      BIGINT NOT NULL,
  history        JSON,
  UNIQUE KEY user_groups_name_idx (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;