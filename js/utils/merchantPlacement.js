import { WAREHOUSE_TYPES } from '../models/Warehouse.js';
import { TYPE_LABEL } from '../models/WarehouseLocation.js';

const ZONE_LABEL = Object.fromEntries(WAREHOUSE_TYPES.map((z) => [z.value, z.label]));

/** The zone label (e.g. "Main Warehouse") for a WarehouseLocation's `zone` value. */
export function zoneLabel(zoneValue) {
  return ZONE_LABEL[zoneValue] || zoneValue;
}

const UNMATCHED = Object.freeze({ matched: false, positionType: '', warehouse: '', owner: '', location: null, warehouseSite: null });

/**
 * Merchant is the key: given a merchant/location name, finds the
 * WarehouseLocation whose Location (locationCode, e.g. "Samples" or
 * "Test Location" — see WarehouseLocationModal's "Create a new position"
 * Area field) matches it, and derives the three columns that follow from
 * where that location lives:
 *
 *   - positionType: the location's own Types of (Good Position / Inventory
 *     Position — see POSITION_TYPES in models/WarehouseLocation.js).
 *   - warehouse: the zone it was created under (Main/Purchase/Returns/
 *     Damage Warehouse — see WAREHOUSE_TYPES in models/Warehouse.js).
 *   - owner: the warehouse *site* that zone belongs to (e.g. "Warehouse 1"
 *     — the warehouse.name from Settings → Warehouse Information).
 *
 * Matching is case-insensitive/trimmed on the location's code, and prefers
 * an enabled location if the same code was created more than once. Returns
 * an all-blank, `matched: false` result when the merchant is empty or
 * doesn't correspond to any created location yet — callers decide how to
 * render/handle that (e.g. leave the asset's placement as unassigned
 * rather than guessing).
 *
 * @param {string} merchant
 * @param {object} stores
 * @param {import('../core/Store.js').Store} stores.locationStore
 * @param {import('../core/Store.js').Store} stores.warehouseStore
 */
export function resolveMerchantPlacement(merchant, { locationStore, warehouseStore } = {}) {
  const key = (merchant || '').trim().toLowerCase();
  if (!key || !locationStore || !warehouseStore) return UNMATCHED;

  const matches = locationStore.list().filter((l) => (l.locationCode || '').trim().toLowerCase() === key);
  if (matches.length === 0) return UNMATCHED;

  const location = matches.find((l) => l.enabled) || matches[0];
  const warehouseSite = warehouseStore.get(location.warehouseId);
  if (!warehouseSite) return UNMATCHED;

  return {
    matched: true,
    positionType: TYPE_LABEL[location.property] || location.property,
    warehouse: zoneLabel(location.zone),
    owner: warehouseSite.name,
    location,
    warehouseSite
  };
}

/**
 * The warehouse (Settings → Warehouse Information site) id a transfer
 * into this resolved placement would land in, or '' if unmatched. This
 * is what decides who may confirm the transfer: see
 * core/WarehouseScope.js's isWarehouseAllowed() and
 * ManageController._canActOnPendingTransfer — anyone whose User Group is
 * bound to this warehouse (Settings → User management → User group →
 * "Bind warehouse") can act on it, the same scoping that already governs
 * what they see elsewhere in Manage/Reports, rather than a separate
 * per-location assignment.
 */
export function destinationWarehouseId(placement) {
  return placement?.matched ? (placement.warehouseSite?.id || '') : '';
}
