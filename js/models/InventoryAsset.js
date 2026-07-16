import { generateId } from '../utils/id.js';

/**
 * InventoryAsset is the domain model for the master inventory list — the
 * raw stock of physical assets (category, serial number, asset tag, MAC
 * address) before/regardless of who they're assigned to. This is
 * deliberately separate from Gadget: Gadget tracks *assignment*
 * (user, warehouse, password, remarks); InventoryAsset tracks the
 * *item itself* as it enters the system.
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
