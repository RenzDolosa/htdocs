import { generateId } from '../utils/id.js';

/**
 * The four fixed zone labels shown under every warehouse in the tree
 * (Main / Purchase / Returns / Damage), each with its own "create
 * warehouse location" link. These are purely organizational labels —
 * not separate records. A warehouse is one site with one set of details
 * (name, address, contact, etc.); it is not four independent warehouses.
 */
export const WAREHOUSE_TYPES = [
  { value: 'main', label: 'Main Warehouse' },
  { value: 'purchase', label: 'Purchase Warehouse' },
  { value: 'returns', label: 'Returns Warehouse' },
  { value: 'damage', label: 'Damage Warehouse' }
];

/**
 * Warehouse is the domain model for a physical/logical storage site
 * configured under Settings → Basic Configuration → Warehouse Information.
 * One record = one site (e.g. "Krus5K"). `operationMode` is the
 * "Warehouse Type" form field (self-operated vs third-party) — an
 * attribute of the site, unrelated to the Main/Purchase/Returns/Damage
 * zone labels above.
 *
 * `warehouseCode` is a short numeric display id (like "3938" in the
 * reference UI) — cosmetic only, not used as the storage key.
 */
export class Warehouse {
  constructor(data = {}) {
    this.id = data.id || generateId('wh');
    this.warehouseCode = data.warehouseCode || String(1000 + Math.floor(Math.random() * 8999));
    this.name = data.name || '';
    this.operationMode = data.operationMode || 'self-operate';
    this.shortName = data.shortName || '';
    this.currency = data.currency || 'PHP';
    this.country = data.country || 'Philippines';
    this.region = data.region || '';
    this.city = data.city || '';
    this.barangay = data.barangay || '';
    this.fullAddress = data.fullAddress || '';
    this.contactPerson = data.contactPerson || '';
    this.publicHomePage = data.publicHomePage !== false;
    this.phoneNumber = data.phoneNumber || '';
    this.email = data.email || '';
    this.zipCode = data.zipCode || '';
    this.areaPriority = data.areaPriority || '';
    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = data.updatedAt || Date.now();
  }

  static validate(data) {
    const errors = {};
    if (!data.name || !data.name.trim()) errors.name = 'Warehouse name is required.';
    if (!data.fullAddress || !data.fullAddress.trim()) errors.fullAddress = 'Full address is required.';
    if (!data.contactPerson || !data.contactPerson.trim()) errors.contactPerson = 'Contact person is required.';
    if (!data.phoneNumber || !data.phoneNumber.trim()) errors.phoneNumber = 'Phone number is required.';
    return { valid: Object.keys(errors).length === 0, errors };
  }
}
