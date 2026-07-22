/**
 * Which warehouses (Settings → Warehouse Information) the currently
 * signed-in session is allowed to see, set once, right after sign-in, by
 * applyCurrentUserScope() in app.js — the same moment Permissions.js's
 * setPermissions() is called, from the same resolved User Group.
 *
 * This is deliberately its own tiny singleton module rather than folded
 * into Permissions.js: Permissions gates menu *sections* (can they open
 * Manage at all?); this gates warehouse *data* within a section a person
 * already has access to (which warehouses' assets do they see inside
 * Manage/Reports?). A group can restrict one without the other.
 *
 * No group assigned (or the assigned group's "Bind warehouse" list is
 * left empty) resolves to `null` here, which every reader below treats
 * as "every warehouse" — same opt-in-restriction philosophy as
 * Permissions.js: a group only starts narrowing what its members see
 * once an admin explicitly binds it to specific warehouses, rather than
 * every account that predates this feature suddenly losing warehouses
 * it used to see.
 */
let boundWarehouseIds = null;

/** @param {string[]|null} ids - a group's UserGroup.boundWarehouseIds, or null/[] for unrestricted. */
export function setBoundWarehouseIds(ids) {
  boundWarehouseIds = Array.isArray(ids) && ids.length ? [...ids] : null;
}

/** @returns {string[]|null} the raw id list, or null when unrestricted. */
export function getBoundWarehouseIds() {
  return boundWarehouseIds;
}

/** @returns {boolean} whether the signed-in session is restricted to a warehouse subset at all. */
export function isWarehouseScoped() {
  return boundWarehouseIds !== null;
}

/** @returns {boolean} true when unrestricted, or when `warehouseId` is one this session is bound to. */
export function isWarehouseAllowed(warehouseId) {
  if (!boundWarehouseIds) return true;
  return boundWarehouseIds.includes(warehouseId);
}
