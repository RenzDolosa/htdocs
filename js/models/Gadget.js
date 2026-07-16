import { generateId } from '../utils/id.js';

/**
 * The position types offered by the "Move to temporary bin" bulk action
 * (Manage's Adjust Position → Transfer to temporary bin). These represent
 * a holding area a physical asset can sit in temporarily, separate from
 * its normal `warehouse` — e.g. a returned item waiting to be inspected
 * before it goes back into regular stock.
 */
export const TEMP_POSITION_TYPES = [
  { value: 'picking', label: 'Temporary Position' },
  { value: 'purchase', label: 'Temporary Purchase' },
  { value: 'returned', label: 'Temporary Returned' },
  { value: 'defective', label: 'Temporary Damage' }
];

export function temporaryPositionLabel(value) {
  return TEMP_POSITION_TYPES.find((t) => t.value === value)?.label || '';
}

/**
 * Gadget is the domain model for a single tracked asset (a device assigned
 * to a user, sitting in a warehouse). Unlike a stock-keeping unit, each
 * Gadget record represents one physical item — there's no quantity.
 *
 * `history` is an append-only log of what happened to this record
 * (created, edited, transferred). The Store persists it as plain data;
 * LogModal is the generic viewer that renders it.
 */
export class Gadget {
  constructor(data = {}) {
    this.id = data.id || generateId('gadget');
    this.user = data.user || '';
    this.role = data.role || '';
    this.category = data.category || 'Uncategorized';
    this.serialNumber = data.serialNumber || '';
    this.warehouseAssetTag = data.warehouseAssetTag || '';
    this.assetTagDefault = data.assetTagDefault || '';
    this.macAddress = data.macAddress || '';
    this.password = data.password || '';
    this.merchant = data.merchant || '';
    this.remarks = data.remarks || '';
    this.description = data.description || '';
    this.positionType = data.positionType || '';
    this.warehouse = data.warehouse || '';
    this.temporaryPosition = data.temporaryPosition || '';
    this.updatedAt = data.updatedAt || Date.now();
    this.history = Array.isArray(data.history) ? data.history : [];
  }

  /**
   * Appends an entry to this record's history log (newest last in storage,
   * newest first when rendered). `meta` is optional structured data for
   * entries whose message alone isn't enough for other features to consume
   * (e.g. a 'user' reassignment entry carries { from, to } so callers don't
   * have to parse it back out of the message text).
   */
  /**
   * Appends an entry to this record's history log (newest last in storage,
   * newest first when rendered). `meta` is optional structured data for
   * entries whose message alone isn't enough for other features to consume
   * (e.g. a 'user' reassignment entry carries { from, to } so callers don't
   * have to parse it back out of the message text). `performedBy` is the
   * operator name (see core/Operator.js) at the time of the action — blank
   * for entries logged before this field existed, or if no operator name
   * was ever set.
   */
  addLogEntry(message, type = 'update', meta = null, performedBy = '') {
    const entry = { id: generateId('log'), type, message, timestamp: Date.now() };
    if (meta) entry.meta = meta;
    if (performedBy) entry.performedBy = performedBy;
    this.history.push(entry);
  }

  /**
   * The user who held this asset immediately before whoever holds it now —
   * i.e. the "from" side of the most recent user reassignment — or '' if
   * this asset has never been reassigned from one user to another.
   * Powers the Manifest's "Recent Responsible" column.
   */
  getLastResponsible() {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const entry = this.history[i];
      if (entry.type === 'user' && entry.meta && entry.meta.from) return entry.meta.from;
    }
    return '';
  }

  /**
   * Validates a raw form payload before it becomes a Gadget.
   * Returns { valid, errors } where errors is keyed by field name.
   * Note: warehouse is deliberately not validated here — it's not part of
   * the add/edit form. New gadgets start unassigned and are placed in a
   * warehouse via the Transfer action, which logs the assignment.
   *
   * @param {object} data - raw form payload.
   * @param {object} [opts]
   * @param {Gadget[]} [opts.existingGadgets] - other records to check the serial
   *        number against (the caller excludes the record being edited itself).
   *        Blank serial numbers are exempt — only non-empty duplicates are rejected.
   */
  static validate(data, { existingGadgets = [] } = {}) {
    const errors = {};
    if (!data.category || !data.category.trim()) errors.category = 'Category is required.';

    const serial = (data.serialNumber || '').trim().toLowerCase();
    if (serial) {
      const isDuplicate = existingGadgets.some((g) => (g.serialNumber || '').trim().toLowerCase() === serial);
      if (isDuplicate) errors.serialNumber = 'This serial number is already used by another asset.';
    }

    return { valid: Object.keys(errors).length === 0, errors };
  }
}