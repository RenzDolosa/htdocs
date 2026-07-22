import { generateId } from '../utils/id.js';

/**
 * The fixed set of areas a UserGroup's permission tree can grant or deny.
 * This mirrors the app's own navigation 1:1 (see index.html's settingsNav
 * and the top-level tabs in TabManager) — NOT the reference screenshot's
 * menu (Order / Social / POS / Live / Distributor / Seller Center / etc.
 * belong to a different, unrelated warehouse system and have no
 * equivalent here). Only the permission-tree UI pattern — expandable
 * rows, an Allow/Not-allow toggle per row — comes from that reference.
 *
 * Each node's `key` is what gets stored in a group's `permissions` map;
 * children nest exactly the way the Settings rail nests them.
 */
export const PERMISSION_TREE = [
  { key: 'home', label: 'Home Page' },
  {
    key: 'manage', label: 'Manage', children: [
      { key: 'manage.add', label: 'Add Manage' },
      { key: 'manage.import', label: 'Import' },
      { key: 'manage.adjust-position', label: 'Adjust Position' },
      { key: 'manage.preview-manifest', label: 'Preview Manifest' },
      { key: 'manage.delete-selected', label: 'Delete selected' },
      { key: 'manage.clear-all', label: 'Clear all data' },
      {
        key: 'manage.edit', label: 'Edit', children: [
          { key: 'manage.edit.category', label: 'Category' },
          { key: 'manage.edit.serial-number', label: 'Serial number' },
          { key: 'manage.edit.mac-address', label: 'MAC address' },
          { key: 'manage.edit.asset-tag-default', label: 'Asset tag (default)' },
          { key: 'manage.edit.merchant', label: 'Merchant' },
          { key: 'manage.edit.remarks', label: 'Remarks' }
        ]
      },
      { key: 'manage.view-log', label: 'View log' },
      { key: 'manage.delete', label: 'Delete' }
    ]
  },
  {
    key: 'inventory-assets', label: 'Inventory Assets', children: [
      { key: 'inventory-assets.add', label: 'Add Asset' },
      { key: 'inventory-assets.import', label: 'Import' },
      { key: 'inventory-assets.delete-selected', label: 'Delete selected' },
      { key: 'inventory-assets.clear-all', label: 'Clear all data' },
      {
        key: 'inventory-assets.edit', label: 'Edit', children: [
          { key: 'inventory-assets.edit.category', label: 'Category' },
          { key: 'inventory-assets.edit.serial-number', label: 'Serial number' },
          { key: 'inventory-assets.edit.asset-tag', label: 'Asset tag' },
          { key: 'inventory-assets.edit.mac-address', label: 'MAC address' },
          { key: 'inventory-assets.edit.imei1', label: 'IMEI 1' },
          { key: 'inventory-assets.edit.imei2', label: 'IMEI 2' }
        ]
      },
      { key: 'inventory-assets.delete', label: 'Delete' }
    ]
  },
  { key: 'reports', label: 'Reports' },
  {
    key: 'settings', label: 'Settings', children: [
      { key: 'settings.general', label: 'General' },
      { key: 'settings.warehouse-info', label: 'Warehouse Information' },
      {
        key: 'settings.user-mgmt', label: 'User management', children: [
          { key: 'settings.user-mgmt.user-groups', label: 'User group' },
          { key: 'settings.user-mgmt.user-accounts', label: 'User' }
        ]
      },
      { key: 'settings.ip-whitelist', label: 'IP whitelist' }
    ]
  }
];

/** Flattens PERMISSION_TREE into every key it contains. */
function allKeys(nodes = PERMISSION_TREE) {
  return nodes.flatMap((n) => [n.key, ...(n.children ? allKeys(n.children) : [])]);
}

/** Every permission denied — the least-privilege starting point for a
 * brand-new group. An admin opts each area in explicitly from here. */
export function defaultPermissions() {
  return Object.fromEntries(allKeys().map((k) => [k, false]));
}

/**
 * UserGroup is a named role shown under Settings → User management →
 * User group — a reusable bundle of menu permissions that a UserAccount
 * can be placed into (via its existing free-text `userGroup` field; see
 * UserGroupController._boundUsernames for how the two connect without
 * requiring a schema change to UserAccount).
 */
export class UserGroup {
  constructor(data = {}) {
    this.id = data.id || generateId('ugr');
    // Cosmetic display id, like "1643160923073769472" in the reference UI — not used as a lookup key.
    this.groupNumber = data.groupNumber || `${Date.now()}${String(Math.floor(Math.random() * 900) + 100)}`;
    this.name = data.name || '';
    this.enabled = data.enabled !== false;
    // { [permissionKey]: boolean } — every PERMISSION_TREE key gets an explicit
    // entry so the form never has to guess a missing key's state.
    this.permissions = { ...defaultPermissions(), ...(data.permissions || {}) };
    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = data.updatedAt || Date.now();
    this.history = data.history || [];
  }

  static validate(data, { existing = [], editingId = null } = {}) {
    const errors = {};
    if (!data.name || !data.name.trim()) {
      errors.name = 'User group name is required.';
    } else {
      const dupe = existing.some((g) => g.id !== editingId && g.name.trim().toLowerCase() === data.name.trim().toLowerCase());
      if (dupe) errors.name = 'This user group name is already in use.';
    }
    return { valid: Object.keys(errors).length === 0, errors };
  }

  /** Mirrors Gadget.addLogEntry / UserAccount.addLogEntry — same shape, so it drops straight into the shared LogModal. */
  addLogEntry(message, type = 'update', meta = null, performedBy = '') {
    const entry = { id: generateId('log'), type, message, timestamp: Date.now() };
    if (meta) entry.meta = meta;
    if (performedBy) entry.performedBy = performedBy;
    this.history.push(entry);
  }
}
