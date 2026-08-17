import { Gadget } from '../models/Gadget.js';
import { getOperatorName } from './Operator.js';

/**
 * Keeps Manage's Gadget list in sync with Inventory Assets — every asset
 * added, imported, or later edited there is reflected onto its matching
 * Gadget automatically, so a freshly-catalogued item shows up ready to
 * assign, and a correction made afterward doesn't leave Manage quietly
 * showing stale values. Two entry points below: createGadgetFromInventoryAsset
 * (add/import — makes a brand-new Gadget) and syncGadgetsFromInventoryAsset
 * (edit — pushes changes onto whatever Gadget is already linked). Both are
 * also exactly what ManageController's own _catalogIssues() was built to
 * catch mismatches in after the fact (see its doc comment) — this closes
 * that same gap at the source instead of only ever flagging it later.
 *
 * Field mapping is deliberately narrow — only what actually describes the
 * physical item, not assignment state:
 *   InventoryAsset.category     -> Gadget.category
 *   InventoryAsset.serialNumber -> Gadget.serialNumber
 *   InventoryAsset.assetTag     -> Gadget.assetTagDefault (NOT
 *     warehouseAssetTag — that one's a *site-assigned* tag, set once a
 *     gadget actually lands somewhere; assetTagDefault is the catalog's
 *     own tag, the same distinction _catalogIssues() already draws)
 *   InventoryAsset.macAddress   -> Gadget.macAddress
 * imei1/imei2 are deliberately skipped, per instruction — Gadget has no
 * equivalent field at all, and nothing here should add one just to hold
 * them.
 *
 * The new Gadget otherwise starts blank/unassigned (no user, warehouse,
 * position) — this creates the catalog record, not an assignment; that
 * still happens the normal way, through Manage's own Transfer action.
 * inventoryAssetId links it back to the row that created it (the same
 * real foreign key _catalogIssues()'s doc comment already describes), so
 * the two stay traceably connected from the start instead of only ever
 * being matched loosely by serial number later.
 *
 * Deliberately unconditional — no "does a Gadget already exist for this
 * serial" check. The app already has duplicate-serial detection in
 * Manage's own grid (a warning, not a hard block), same treatment every
 * other duplicate gets there; this doesn't invent a second, different
 * rule just for sync-created rows.
 *
 * createGadgetFromInventoryAsset takes an optional `assetReady` — the
 * Promise SupabaseStore.createAndWait() returns for the InventoryAsset
 * this Gadget is about to link to — and awaits it before inserting the
 * Gadget. Skipping that used to race two independent inserts against
 * each other: gadgets."inventoryAssetId" has a real foreign key onto
 * inventory_assets(id) (see schema.sql), so if the Gadget's insert
 * reached Postgres before the InventoryAsset's had committed, the FK
 * check failed and the optimistic Gadget silently rolled back off
 * Manage's list a moment after appearing — the asset itself still saved
 * fine, so nothing about it looked like a failure. Waiting for
 * `assetReady` first closes that race instead of hoping the two land in
 * the right order.
 */
/**
 * The InventoryAsset -> Gadget field mapping itself, shared by both
 * createGadgetFromInventoryAsset (on add/import) and
 * syncGadgetsFromInventoryAsset (on edit) below, so the two can never
 * quietly drift apart on what gets mapped.
 */
function mapAssetToGadgetFields(asset) {
  return {
    category: asset.category || 'Uncategorized',
    serialNumber: asset.serialNumber,
    assetTagDefault: asset.assetTag,
    macAddress: asset.macAddress
  };
}

/**
 * @param {import('../models/InventoryAsset.js').InventoryAsset} asset
 * @param {*} gadgetStore
 * @param {Promise|null} [assetReady] - from SupabaseStore.createAndWait(asset)
 *   for the same asset; awaited (if given) before the Gadget insert fires,
 *   to avoid the FK race described above. Omit only when `asset` is
 *   already known-persisted some other way (there's no such caller today
 *   — every call site should be passing this).
 * @returns the created Gadget, or null if `assetReady` resolved to null
 *   (the InventoryAsset itself failed to save, so there's nothing valid
 *   to link a Gadget to).
 */
export async function createGadgetFromInventoryAsset(asset, gadgetStore, assetReady = null) {
  if (assetReady) {
    const persisted = await assetReady;
    if (!persisted) return null;
  }
  // createdAt is explicitly inherited from the InventoryAsset, not left to
  // Gadget's own "defaults to now" fallback (see models/Gadget.js) — this
  // line only runs after `assetReady` resolves, i.e. after a real network
  // round-trip to confirm the InventoryAsset's insert landed. Left to
  // default, the Gadget's Created timestamp would be stamped however long
  // that round-trip happened to take *after* the InventoryAsset's own
  // Created moment — a few hundred ms on a fast connection, much more on
  // a slow one — instead of both records reading as the same event,
  // which is what they actually are: one asset entering the catalog.
  const gadget = new Gadget({ ...mapAssetToGadgetFields(asset), inventoryAssetId: asset.id, createdAt: asset.createdAt });
  const created = gadgetStore.create(gadget);
  created.addLogEntry('Added to catalog via Inventory Assets.', 'create', null, getOperatorName());
  gadgetStore.update(created.id, { history: created.history });
  return created;
}

/**
 * Called after an existing Inventory Asset is edited — pushes the same
 * mapped fields to every Gadget still linked via inventoryAssetId, so a
 * correction made in Inventory Assets (the catalog's source of truth,
 * same framing ManageController._catalogIssues() already uses to flag
 * mismatches) doesn't leave Manage quietly showing stale values. This is
 * what actually *fixes* the mismatch _catalogIssues() only ever warns
 * about — the InventoryAsset.category/serialNumber/assetTag/macAddress
 * columns shown with a ⚠ in Manage's grid are exactly what this closes.
 *
 * Only touches gadgets whose mapped fields actually differ from the
 * asset's current values — an edit that didn't change anything mapped
 * (e.g. only imei1) shouldn't write a no-op update or log a history
 * entry for a change that didn't really happen. Updates every linked
 * gadget, not just the first found, in case more than one somehow ended
 * up pointed at the same asset.
 */
export function syncGadgetsFromInventoryAsset(asset, gadgetStore) {
  const mapped = mapAssetToGadgetFields(asset);
  const linked = gadgetStore.list().filter((g) => g.inventoryAssetId === asset.id);

  linked.forEach((gadget) => {
    const changedFields = Object.keys(mapped).filter((key) => (gadget[key] || '') !== (mapped[key] || ''));
    if (changedFields.length === 0) return;

    gadgetStore.update(gadget.id, mapped);
    gadget.addLogEntry('Synced from Inventory Assets after an edit.', 'update', { fields: changedFields }, getOperatorName());
    gadgetStore.update(gadget.id, { history: gadget.history });
  });
}

/**
 * Called after one or more Inventory Assets are deleted (a single row's
 * own Delete, "Delete selected", or "Clear all data" — every delete path
 * InventoryAssetController has) — removes every Gadget still linked via
 * inventoryAssetId to any of those asset ids, so the catalog and Manage
 * stay in the same "deleted means deleted" state createGadgetFromInventoryAsset
 * put them in in the first place, rather than leaving an orphaned Manage
 * row behind for an item that no longer exists in the catalog at all.
 *
 * This is the UI-level cascade, run only when someone explicitly deletes
 * from Inventory Assets — schema.sql's own foreign key is deliberately
 * `on delete set null`, not `on delete cascade`, so that a manual `delete
 * from inventory_assets` run directly against the database (outside this
 * app entirely) doesn't silently vanish Gadgets nobody meant to touch;
 * the app's own delete flows opt into the stronger, cascading behavior
 * on purpose instead.
 *
 * Returns the number of Gadgets removed, so callers can fold it into
 * their own success Toast rather than reporting only the asset count and
 * leaving the Manage-side cleanup unmentioned.
 */
export function deleteGadgetsLinkedToInventoryAssets(assetIds, gadgetStore) {
  if (!gadgetStore || !assetIds || assetIds.length === 0) return 0;
  const idSet = new Set(assetIds);
  const linked = gadgetStore.list().filter((g) => g.inventoryAssetId && idSet.has(g.inventoryAssetId));
  linked.forEach((g) => gadgetStore.delete(g.id));
  return linked.length;
}
