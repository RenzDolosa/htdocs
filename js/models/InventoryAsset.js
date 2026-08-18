import { generateId } from '../utils/id.js';

/**
 * InventoryAsset is the domain model for the master inventory list — the
 * raw stock of physical assets (category, serial number, asset tag, MAC
 * address) before/regardless of who they're assigned to. This is
 * deliberately separate from Gadget: Gadget tracks *assignment*
 * (user, warehouse, password, remarks); InventoryAsset tracks the
 * *item itself* as it enters the system.
 *
 * `history` is an append-only log, same shape and viewer (LogModal) as
 * Gadget's own — but unlike Gadget, only ever logs field *changes*, never
 * creation itself (see InventoryAssetController._saveAsset): a fresh
 * asset's log starts empty rather than with a redundant "Added to
 * inventory" entry, since the Created column already answers that.
 */
export class InventoryAsset {
  constructor(data = {}) {
    this.id = data.id || generateId('asset');
    this.category = data.category || '';
    this.serialNumber = data.serialNumber || '';
    this.assetTag = data.assetTag || '';
    this.macAddress = data.macAddress || '';
    this.imei1 = data.imei1 || '';
    this.imei2 = data.imei2 || '';
    // createdAt answers "when did this asset enter inventory". It defaults
    // to now for a brand-new record, but is an editable form field (see
    // InventoryAssetForm) so it can be corrected/backdated by hand.
    this.createdAt = data.createdAt || Date.now();
    // Stamped automatically by SupabaseStore.update() on every edit (it
    // only touches fields already present on the record — see that
    // method's own comment on why), so this never needs setting by hand
    // outside of loading an existing row back out of the store.
    this.updatedAt = data.updatedAt || Date.now();
    this.history = Array.isArray(data.history) ? data.history : [];
  }

  /** Same shape/behavior as Gadget.addLogEntry — see that model's own
   * doc comment. Duplicated rather than shared because there's no common
   * base class between the two models to hang it off of, and it's four
   * lines. */
  addLogEntry(message, type = 'update', meta = null, performedBy = '') {
    const entry = { id: generateId('log'), type, message, timestamp: Date.now() };
    if (meta) entry.meta = meta;
    if (performedBy) entry.performedBy = performedBy;
    this.history.push(entry);
  }

  /**
   * Logs one entry per changed field among category/serialNumber/
   * assetTag/imei1/imei2/macAddress — e.g. "Category: 'Keyboard' →
   * 'Mouse'" — comparing this asset's current values against `payload`.
   * The only thing this model's history ever records (see this class's
   * own doc comment for why plain creation isn't logged the way
   * Gadget's is). Called from both directions this record can be edited
   * from: InventoryAssetController._saveAsset (edited directly here) and
   * core/InventoryGadgetSync.js's syncInventoryAssetFromGadget (pushed
   * from a Manage edit on the linked Gadget) — either way, the change
   * shows up in this same log.
   *
   * Mutates this.history in place rather than returning a new array —
   * the caller's later store.update() call reads whatever's already on
   * this same object reference, so there's nothing else to pass along
   * explicitly (same pattern ManageController's own _logFieldChanges
   * uses for Gadget).
   */
  logFieldChanges(payload, performedBy = '') {
    const fields = [
      ['category', 'Category'],
      ['serialNumber', 'Serial number'],
      ['assetTag', 'Asset tag'],
      ['imei1', 'IMEI 1'],
      ['imei2', 'IMEI 2'],
      ['macAddress', 'MAC address']
    ];
    fields.forEach(([key, label]) => {
      const from = this[key] || '';
      const to = payload[key] || '';
      if (from === to) return;
      this.addLogEntry(`${label}: '${from || '(blank)'}' → '${to || '(blank)'}'`, 'update', { field: key, from, to }, performedBy);
    });
  }

  /**
   * Validates a raw form payload before it becomes an InventoryAsset.
   * @param {object} data
   * @param {object} [opts]
   * @param {InventoryAsset[]} [opts.existingAssets] - other records to check
   *        the serial number against (caller excludes the record being edited).
   *        Blank serial numbers are exempt — only non-empty duplicates are rejected.
   */
  static validate(data, { existingAssets = [] } = {}) {
    const errors = {};
    if (!data.category || !data.category.trim()) errors.category = 'Category is required.';

    const serial = (data.serialNumber || '').trim().toLowerCase();
    if (serial) {
      const isDuplicate = existingAssets.some((a) => (a.serialNumber || '').trim().toLowerCase() === serial);
      if (isDuplicate) errors.serialNumber = 'This serial number is already used by another asset.';
    }

    return { valid: Object.keys(errors).length === 0, errors };
  }
}
