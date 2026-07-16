import { generateId } from '../utils/id.js';

/**
 * WarehouseLocation is a single storage position/slot inside one zone
 * (Main / Purchase / Returns / Damage — see WAREHOUSE_TYPES in
 * Warehouse.js) of one warehouse site. `zone` is what keeps the four
 * zones' location lists independent — without it, "create warehouse
 * location" under Purchase Warehouse and under Main Warehouse would show
 * the exact same records. Positions created before this field existed
 * default to 'main', matching how they behaved beforehand (every zone
 * link opened the one shared list).
 */
const LEGACY_PROPERTY_MAP = { picking: 'goods', temporary: 'inventory' };

export class WarehouseLocation {
  constructor(data = {}) {
    this.id = data.id || generateId('loc');
    this.warehouseId = data.warehouseId || '';
    this.zone = data.zone || 'main';
    this.area = data.area || '';
    this.row = data.row ?? '';
    this.column = data.column ?? '';
    this.layer = data.layer ?? '';
    this.cell = data.cell ?? '';
    this.locationCode = data.locationCode || '';
    this.positionNumber = data.positionNumber || '';
    this.length = data.length ?? '';
    this.width = data.width ?? '';
    this.height = data.height ?? '';
    // 'goods' = Goods Position, 'inventory' = Inventory Position (see
    // POSITION_TYPES in WarehouseLocationModal.js, the single source of
    // truth for these two values and their display labels). Older
    // records saved before that rename used 'picking'/'temporary' —
    // normalized here on read so they display and filter correctly
    // without a one-time migration step.
    const rawProperty = data.property || 'goods';
    this.property = LEGACY_PROPERTY_MAP[rawProperty] || rawProperty;
    this.enabled = data.enabled !== false;
    this.createdAt = data.createdAt || Date.now();
  }
}