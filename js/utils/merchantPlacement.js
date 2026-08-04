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
 * Matching is case-insensitive/trimmed on the location's code. A location
 * that's been deactivated (Settings → Warehouse Information → Warehouse
 * location's Enable toggle) never matches, even if its code is otherwise
 * an exact match and even if it's the only location ever created under
 * that name — a merchant name only resolves to somewhere real if that
 * somewhere is currently active. Returns an all-blank, `matched: false`
 * result in that case, and whenever the merchant is empty or doesn't
 * correspond to any created location at all — callers decide how to
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

  const location = locationStore.list().find((l) => l.enabled && (l.locationCode || '').trim().toLowerCase() === key);
  if (!location) return UNMATCHED;

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
 * into this resolved placement would land in, or '' if unmatched.
 * Stored on Gadget.pendingTransfer.toWarehouseId for two separate
 * purposes that shouldn't be conflated (see
 * ManageController._canActOnPendingTransfer's own doc comment): it's
 * what core/WarehouseScope.js's isWarehouseAllowed() checks to decide
 * whether a pending transfer is even *visible* to a given scoped
 * session, but it plays no part in deciding who may actually confirm or
 * cancel it — that's manage.confirm-transfers alone, the same explicit
 * single-permission gate as every other action in this app.
 */
export function destinationWarehouseId(placement) {
  return placement?.matched ? (placement.warehouseSite?.id || '') : '';
}
