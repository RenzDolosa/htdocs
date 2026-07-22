import { temporaryPositionLabel } from '../../models/Gadget.js';
import { openDropdownMenu } from '../../components/DropdownMenu.js';
import { Modal } from '../../components/Modal.js';
import { toCsv, downloadCsv } from '../../utils/csv.js';
import { fmtLocalDateStamp } from '../../utils/format.js';
import { TYPE_LABEL } from '../settings/WarehouseLocationModal.js';
import { esc, el } from '../../utils/dom.js';
import { isWarehouseAllowed, isWarehouseScoped } from '../../core/WarehouseScope.js';

/**
 * ReportsController drives the read-only Reports tab: summary stat cards,
 * breakdown bars (by category / warehouse / position type), and a
 * cross-asset activity feed built from every Gadget's own history log.
 *
 * Unlike Manage/InventoryAssets/Settings, this controller never writes to
 * any store — it only reads store.list() and re-renders on 'change', the
 * same reactive pattern the other controllers use, just one-directional.
 */
export class ReportsController {
  constructor({ store, inventoryAssetStore, warehouseStore, locationStore, view, refs }) {
    this.store = store; // Gadgets — the primary source for every card/breakdown here
    this.inventoryAssetStore = inventoryAssetStore;
    this.warehouseStore = warehouseStore;
    this.locationStore = locationStore;
    this.view = view;
    this.refs = refs;
    // Same "Warehouse" side-tab filter as Manage: everything on this
    // dashboard narrows to one warehouse's assets when a filter is
    // active, 'all' otherwise. See _knownOwners() for why the flyout's
    // option list comes from Settings rather than from Gadget records.
    this.state = { filters: { owner: 'all' } };
  }

  init() {
    this.store.on('change', () => this.render());
    this.inventoryAssetStore?.on('change', () => this.render());
    this.warehouseStore?.on('change', () => this.render());
    this.locationStore?.on('change', () => this.render());
    this.refs?.warehouseFilterBtn?.addEventListener('click', () => this._openWarehouseFilterMenu());
    this.refs?.exportBtn?.addEventListener('click', () => this._exportSummary());
    this.render();
  }

  render() {
    const gadgets = this._filteredGadgets();

    this.view.renderWarehouseFilterButton?.(this._knownOwners().length > 0, this._effectiveOwnerFilter());
    this.view.renderStats(this._stats(gadgets), {
      duplicateSerials: () => this._openDuplicateSerialsModal(gadgets)
    });
    this.view.renderCategoryBreakdown('reportByCategory', this._categoryBreakdownWithAssigned(gadgets));
    this.view.renderBreakdown('reportByWarehouse', this._countBy(gadgets, (g) => g.warehouse || 'Unassigned'));
    this.view.renderBreakdown('reportByPosition', this._countBy(gadgets, (g) => this._positionLabel(g)));
    this.view.renderBreakdown('reportByAssetCategory', this._countBy(this._inventoryAssets(), (a) => a.category || 'Uncategorized'));
    this.view.renderBreakdown('reportByLocationType', this._countBy(this._locations(), (loc) => TYPE_LABEL[loc.property] || loc.property || 'Unspecified'));
    this.view.renderActivity(this._recentActivity(gadgets, 25));
  }

  /** Inventory Assets aren't warehouse-scoped, so the Warehouse filter
   * doesn't apply to this breakdown — it's a system-wide catalog count. */
  _inventoryAssets() {
    return this.inventoryAssetStore ? this.inventoryAssetStore.list() : [];
  }

  /** Warehouse Locations are scoped to the selected warehouse site — the
   * same "Warehouse" filter every other card on this dashboard already
   * respects — unlike Inventory Assets above. This is a real relationship,
   * not an approximation: a location's warehouseId always ties it to one
   * specific site (see WarehouseLocation.warehouseId), so "all locations
   * under Warehouse 1" is a precise, direct lookup. When warehouse-scoped
   * (see core/WarehouseScope.js), locations belonging to a warehouse
   * outside that scope are excluded even under "All". */
  _locations() {
    const all = this.locationStore ? this.locationStore.list() : [];
    if (!this.warehouseStore) return all;

    const scopedSiteIds = new Set(
      this.warehouseStore.list().filter((w) => isWarehouseAllowed(w.id)).map((w) => w.id)
    );
    let filtered = isWarehouseScoped() ? all.filter((loc) => scopedSiteIds.has(loc.warehouseId)) : all;

    const owner = this._effectiveOwnerFilter();
    if (owner === 'all') return filtered;

    const matchingSiteIds = new Set(
      this.warehouseStore.list().filter((w) => w.name === owner).map((w) => w.id)
    );
    return filtered.filter((loc) => matchingSiteIds.has(loc.warehouseId));
  }

  /** Every gadget, or just the ones owned by the selected warehouse when a
   * filter is active — plus, when warehouse-scoped, always restricted to
   * the session's bound warehouses regardless of the "All"/single-owner
   * selection (see ManageController._filteredSortedGadgets for the same
   * pattern, including why an unassigned gadget is never excluded by
   * scope even though 'Unassigned' isn't itself a bound warehouse). */
  _filteredGadgets() {
    const all = this.store.list();
    const owner = this._effectiveOwnerFilter();
    const allowedOwners = isWarehouseScoped() ? new Set(this._knownOwners()) : null;

    return all.filter((g) => {
      const ownerKey = g.owner || 'Unassigned';
      if (allowedOwners && ownerKey !== 'Unassigned' && !allowedOwners.has(ownerKey)) return false;
      if (owner !== 'all' && ownerKey !== owner) return false;
      return true;
    });
  }

  /**
   * Warehouse names for the side filter button's flyout — every real site
   * configured in Warehouse Information (Settings), same source Manage's
   * equivalent button uses, so a warehouse is filterable here the moment
   * it exists in Settings, even before any asset has been assigned to it.
   * Also where warehouse scoping is enforced for this dashboard — see
   * ManageController._knownOwners for the identical pattern.
   */
  _knownOwners() {
    if (!this.warehouseStore) return [];
    return this.warehouseStore.list()
      .filter((w) => isWarehouseAllowed(w.id))
      .map((w) => w.name).filter(Boolean).sort();
  }

  /** Same "lock to the one bound warehouse, no meaningless All" rule as
   * ManageController._effectiveOwnerFilter(). */
  _effectiveOwnerFilter() {
    const owners = this._knownOwners();
    if (isWarehouseScoped() && owners.length === 1) return owners[0];
    return this.state.filters.owner;
  }

  /** Opens the "Warehouse" button's flyout — same DropdownMenu pattern as Manage's equivalent. */
  _openWarehouseFilterMenu() {
    const owners = this._knownOwners();
    const active = this._effectiveOwnerFilter();
    const showAllOption = !isWarehouseScoped() || owners.length > 1;
    openDropdownMenu({
      anchor: this.refs.warehouseFilterBtn,
      items: [
        ...(showAllOption ? [{ label: active === 'all' ? '✓ All' : 'All', onClick: () => this._selectOwnerFilter('all') }] : []),
        ...owners.map((o) => ({ label: o === active ? `✓ ${o}` : o, onClick: () => this._selectOwnerFilter(o) }))
      ]
    });
  }

  _selectOwnerFilter(value) {
    this.state.filters.owner = value;
    this.render();
  }

  _positionLabel(g) {
    if (g.temporaryPosition) return temporaryPositionLabel(g.temporaryPosition);
    return g.positionType || 'Unassigned';
  }

  _stats(gadgets) {
    const unassigned = gadgets.filter((g) => !g.warehouse).length;
    const duplicateSerials = this._duplicateSerialCount(gadgets);
    return [
      { label: 'Total Gadgets', value: gadgets.length },
      { label: 'Inventory Assets', value: this.inventoryAssetStore ? this.inventoryAssetStore.list().length : 0 },
      { label: 'Warehouses', value: this._knownOwners().length },
      { label: 'Warehouse Locations', value: this._locations().length },
      { label: 'Unassigned Gadgets', value: unassigned, tone: unassigned ? 'warn' : null },
      { label: 'Duplicate Serials', value: duplicateSerials, tone: duplicateSerials ? 'bad' : null, key: 'duplicateSerials' }
    ];
  }

  /** Serial numbers (lowercased, trimmed) shared by more than one gadget —
   * same duplicate rule Manage's grid flags a record with, counted here as
   * the number of *serials* affected rather than the number of records. */
  /** Serial numbers shared by more than one gadget, grouped for the
   * duplicate-serials drill-down — each group keeps the gadgets' own
   * (non-lowercased) serial text plus every gadget that shares it. */
  _duplicateSerialGroups(gadgets) {
    const groups = new Map();
    gadgets.forEach((g) => {
      const key = (g.serialNumber || '').trim().toLowerCase();
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(g);
    });
    return [...groups.values()]
      .filter((list) => list.length > 1)
      .sort((a, b) => b.length - a.length);
  }

  _duplicateSerialCount(gadgets) {
    return this._duplicateSerialGroups(gadgets).length;
  }

  _countBy(gadgets, keyFn) {
    const counts = new Map();
    gadgets.forEach((g) => {
      const key = keyFn(g);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }

  /** Same shape as _countBy, plus how many of each category are actually
   * assigned to a user (g.user is set) — a deliberately different rule
   * from the Unassigned Gadgets stat above, which tracks warehouse
   * assignment instead. Kept separate from _countBy rather than
   * generalizing it, since every other card on this dashboard only ever
   * needs a single count per row. */
  _categoryBreakdownWithAssigned(gadgets) {
    const counts = new Map();
    gadgets.forEach((g) => {
      const label = g.category || 'Uncategorized';
      if (!counts.has(label)) counts.set(label, { count: 0, assigned: 0 });
      const entry = counts.get(label);
      entry.count++;
      if (g.user) entry.assigned++;
    });
    return [...counts.entries()]
      .map(([label, { count, assigned }]) => ({ label, count, assigned }))
      .sort((a, b) => b.count - a.count);
  }

  /** Flattens every gadget's own history log into one cross-asset feed,
   * newest first. A history entry on its own has no idea which asset it
   * belongs to (that's fine inside LogModal, which only ever shows one
   * gadget's log) — here, mixing every gadget's entries together, each one
   * needs a label attached so the feed reads sensibly. */
  _recentActivity(gadgets, limit) {
    const entries = [];
    gadgets.forEach((g) => {
      const assetLabel = g.user || g.serialNumber || g.category || 'Unnamed asset';
      (g.history || []).forEach((entry) => entries.push({ ...entry, assetLabel }));
    });
    return entries.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  /** Turns the inert "Duplicate Serials" count into something actionable:
   * which serial numbers are duplicated, and which assets share each one,
   * so it's actually clear what to go fix instead of just a number. */
  _openDuplicateSerialsModal(gadgets) {
    const groups = this._duplicateSerialGroups(gadgets);

    const body = groups.length === 0
      ? el('<div class="report-dup-modal"><p class="hint">No duplicate serial numbers right now.</p></div>')
      : el(`
        <div class="report-dup-modal">
          <p class="hint" style="margin-bottom:14px;">
            ${groups.length} serial number${groups.length === 1 ? '' : 's'} ${groups.length === 1 ? 'is' : 'are'} used by more than one asset.
          </p>
          ${groups.map((list) => `
            <div class="report-dup-group">
              <div class="report-dup-serial">${esc(list[0].serialNumber)}</div>
              <ul class="report-dup-list">
                ${list.map((g) => `<li>${esc(g.user || 'Unassigned')} — ${esc(g.category || 'Uncategorized')}${g.warehouse ? ` · ${esc(g.warehouse)}` : ''}</li>`).join('')}
              </ul>
            </div>
          `).join('')}
        </div>
      `);

    new Modal({
      title: 'Duplicate Serial Numbers',
      body,
      footer: [{ label: 'Close', variant: 'btn-outline', onClick: (m) => m.close() }]
    }).open();
  }

  /** Downloads a CSV snapshot of the whole dashboard — stats plus every
   * breakdown card — so a warehouse filter view or a point-in-time
   * count can be saved or shared without a screenshot. */
  _exportSummary() {
    const gadgets = this._filteredGadgets();
    const rows = [];

    rows.push(['Section', 'Label', 'Count', 'Assigned']);
    this._stats(gadgets).forEach((s) => rows.push(['Stat', s.label, s.value, '']));
    this._categoryBreakdownWithAssigned(gadgets).forEach((r) => rows.push(['Gadgets by Category', r.label, r.count, r.assigned]));
    this._countBy(gadgets, (g) => g.warehouse || 'Unassigned').forEach((r) => rows.push(['Gadgets by Warehouse', r.label, r.count, '']));
    this._countBy(gadgets, (g) => this._positionLabel(g)).forEach((r) => rows.push(['Gadgets by Position Type', r.label, r.count, '']));
    this._countBy(this._inventoryAssets(), (a) => a.category || 'Uncategorized').forEach((r) => rows.push(['Inventory Assets by Category', r.label, r.count, '']));
    this._countBy(this._locations(), (loc) => TYPE_LABEL[loc.property] || loc.property || 'Unspecified').forEach((r) => rows.push(['Warehouse Locations by Type', r.label, r.count, '']));

    const csv = toCsv(rows[0], rows.slice(1));
    downloadCsv(csv, `stockroom-report-${fmtLocalDateStamp()}.csv`);
  }
}