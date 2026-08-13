import { effectivePositionLabel } from '../../models/Gadget.js';
import { openDropdownMenu } from '../../components/DropdownMenu.js';
import { openDateRangePicker } from '../../components/DateRangePicker.js';
import { Modal } from '../../components/Modal.js';
import { Toast } from '../../components/Toast.js';
import { toCsv, downloadCsv } from '../../utils/csv.js';
import { fmtLocalDateStamp, fmtLocalDateTime } from '../../utils/format.js';
import { TYPE_LABEL } from '../settings/WarehouseLocationModal.js';
import { esc, el } from '../../utils/dom.js';
import { isWarehouseAllowed, isWarehouseScoped } from '../../core/WarehouseScope.js';

/** Labels for Gadget.addLogEntry's `type` values, for the "Activity by
 * Type" breakdown in the monthly report — same categories LogModal's own
 * tabs use, plus the two types LogModal lumps into "All" (create/update)
 * spelled out here since a standalone report has no tab to fall back on. */
const ACTIVITY_TYPE_LABELS = {
  create: 'Asset Added',
  transfer: 'Transfer',
  user: 'User Reassignment',
  remarks: 'Remarks Update',
  update: 'Other Update'
};
function activityTypeLabel(type) {
  return ACTIVITY_TYPE_LABELS[type] || (type ? type[0].toUpperCase() + type.slice(1) : 'Other Update');
}

/** The checkbox list "Export summary" opens before downloading — one entry
 * per breakdown card on the dashboard (Warehouse Locations bundles both
 * location cards, "by Type" and "by Warehouse", since they're one topic
 * to a reader deciding what to include). `rows(ctrl, gadgets)` returns
 * this category's own CSV rows so _exportSummary can just concatenate
 * whichever categories came back checked. */
const EXPORT_CATEGORIES = [
  {
    key: 'category',
    label: 'Gadgets by Category',
    rows: (ctrl, gadgets) => ctrl._categoryBreakdownWithAssigned(gadgets)
      .map((r) => ['Gadgets by Category', r.label, r.count, r.assigned])
  },
  {
    key: 'warehouse',
    label: 'Gadgets by Warehouse',
    rows: (ctrl, gadgets) => ctrl._countBy(gadgets, (g) => g.warehouse || 'Unassigned')
      .map((r) => ['Gadgets by Warehouse', r.label, r.count, ''])
  },
  {
    key: 'position',
    label: 'Gadgets by Position Type',
    rows: (ctrl, gadgets) => ctrl._countBy(gadgets, (g) => ctrl._positionLabel(g))
      .map((r) => ['Gadgets by Position Type', r.label, r.count, ''])
  },
  {
    key: 'inventoryAssets',
    label: 'Inventory Assets',
    rows: (ctrl) => ctrl._countBy(ctrl._inventoryAssets(), (a) => a.category || 'Uncategorized')
      .map((r) => ['Inventory Assets by Category', r.label, r.count, ''])
  },
  {
    key: 'locations',
    label: 'Warehouse Locations',
    rows: (ctrl) => [
      ...ctrl._countBy(ctrl._locations(), (loc) => TYPE_LABEL[loc.property] || loc.property || 'Unspecified')
        .map((r) => ['Warehouse Locations by Type', r.label, r.count, '']),
      ...ctrl._countBy(ctrl._locations(), (loc) => ctrl._warehouseName(loc.warehouseId))
        .map((r) => ['Warehouse Locations by Warehouse', r.label, r.count, ''])
    ]
  }
];

/** The four Recent Activity types the export picker lets a reader
 * narrow to — same log types LogModal's own tabs split on (see
 * ACTIVITY_TYPE_LABELS above), just framed as an opt-in checklist rather
 * than tabs since a CSV export has no "switch tabs and re-export" step. */
const ACTIVITY_EXPORT_TYPES = [
  { key: 'create', label: 'Asset Added' },
  { key: 'transfer', label: 'Transfer Warehouse Location' },
  { key: 'user', label: 'Transfer Users' },
  { key: 'remarks', label: 'Remarks' },
  { key: 'update', label: 'Other Updates' }
];

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
    this.state = {
      filters: { owner: 'all' },
      // Which checkboxes were left checked last time the export picker was
      // opened, so re-opening it (e.g. to export twice in a row with the
      // same subset) doesn't reset back to "everything" every time.
      exportSelection: new Set([
        ...EXPORT_CATEGORIES.map((c) => c.key),
        ...ACTIVITY_EXPORT_TYPES.map((t) => t.key)
      ])
    };
  }

  init() {
    this.store.on('change', () => this.render());
    this.inventoryAssetStore?.on('change', () => this.render());
    this.warehouseStore?.on('change', () => this.render());
    this.locationStore?.on('change', () => this.render());
    this.refs?.warehouseFilterBtn?.addEventListener('click', () => this._openWarehouseFilterMenu());
    this.refs?.exportBtn?.addEventListener('click', () => this._openExportPicker());
    this.refs?.monthlyReportBtn?.addEventListener('click', () => this._openMonthlyReportPicker());
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
    this.view.renderBreakdown('reportByLocation', this._countBy(this._locations(), (loc) => this._warehouseName(loc.warehouseId)));
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

  /** Resolves a WarehouseLocation's warehouseId back to its site name, for
   * the "Warehouse Locations" breakdown card (reportByLocation) — the
   * per-site counterpart to "Warehouse Locations by Type" above, so a
   * reader can see where those 12 locations actually live, not just what
   * kind they are. Falls back to 'Unassigned' the same way an orphaned
   * gadget.warehouse would, rather than silently dropping the row. */
  _warehouseName(warehouseId) {
    if (!warehouseId || !this.warehouseStore) return 'Unassigned';
    const site = this.warehouseStore.list().find((w) => w.id === warehouseId);
    return site?.name || 'Unassigned';
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
    return effectivePositionLabel(g);
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

  /** Opens the "Select what to export" checklist — one group of checkboxes
   * per breakdown card, plus a Recent Activity group broken down by log
   * type, so a reader who only wants (say) Warehouse Locations and
   * Transfer activity isn't stuck with the whole dashboard in one CSV.
   * Selections persist on `this.state.exportSelection` between opens. */
  _openExportPicker() {
    const body = el(`
      <div class="export-picker">
        <div class="export-picker-group">
          <h4>Categories</h4>
          ${EXPORT_CATEGORIES.map((c) => `
            <label class="checkbox-inline export-picker-row">
              <input type="checkbox" data-export-key="${c.key}" ${this.state.exportSelection.has(c.key) ? 'checked' : ''}>
              <span>${esc(c.label)}</span>
            </label>
          `).join('')}
        </div>
        <div class="export-picker-group">
          <h4>Recent Activity</h4>
          ${ACTIVITY_EXPORT_TYPES.map((t) => `
            <label class="checkbox-inline export-picker-row">
              <input type="checkbox" data-export-key="${t.key}" ${this.state.exportSelection.has(t.key) ? 'checked' : ''}>
              <span>${esc(t.label)}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `);

    const readSelection = () => new Set(
      [...body.querySelectorAll('[data-export-key]')]
        .filter((cb) => cb.checked)
        .map((cb) => cb.dataset.exportKey)
    );

    const modal = new Modal({
      title: 'Export Summary',
      body,
      footer: [
        { label: 'Cancel', variant: 'btn-outline', onClick: (m) => m.close() },
        {
          label: 'Export',
          variant: 'btn-accent',
          onClick: (m) => {
            const selected = readSelection();
            if (selected.size === 0) {
              Toast.show('Select at least one category to export.');
              return;
            }
            this.state.exportSelection = selected;
            this._exportSummary(selected);
            m.close();
          }
        }
      ]
    });
    modal.open();
  }

  /** Downloads a CSV snapshot of the dashboard, limited to whichever
   * category and Recent Activity checkboxes came back checked from
   * _openExportPicker — stats stay in every export since they're the
   * headline counts, not one more optional breakdown to opt out of. */
  _exportSummary(selected) {
    const gadgets = this._filteredGadgets();
    const rows = [];

    this._stats(gadgets).forEach((s) => rows.push(['Stat', s.label, s.value, '']));
    EXPORT_CATEGORIES
      .filter((c) => selected.has(c.key))
      .forEach((c) => rows.push(...c.rows(this, gadgets)));

    const activityTypeKeys = new Set(ACTIVITY_EXPORT_TYPES.map((t) => t.key));
    const selectedActivityTypes = new Set([...selected].filter((k) => activityTypeKeys.has(k)));
    if (selectedActivityTypes.size > 0) {
      this._recentActivity(gadgets, Infinity)
        .filter((e) => selectedActivityTypes.has(e.type || 'update'))
        .forEach((e) => rows.push(['Recent Activity', e.message, fmtLocalDateTime(e.timestamp), `${e.assetLabel} — by ${e.performedBy || 'Unknown'}`]));
    }

    const csv = toCsv(['Section', 'Label', 'Count', 'Assigned'], rows);
    downloadCsv(csv, `stockroom-report-${fmtLocalDateStamp()}.csv`);
    Toast.success(`Exported ${EXPORT_CATEGORIES.filter((c) => selected.has(c.key)).length} categor${EXPORT_CATEGORIES.filter((c) => selected.has(c.key)).length === 1 ? 'y' : 'ies'} to CSV.`);
  }

  /**
   * "Monthly report" is really "date-scoped report" — the button opens a
   * DateRangePicker (presets + two-month calendar, modeled on the
   * reference platform's own Shipping Management date filter) rather than
   * hard-locking to a calendar month, since "the last 30 days" or "last
   * quarter" are just as reasonable a stretch to want a report for. The
   * "Last month" preset covers the literal calendar-month case for anyone
   * who does just want that.
   */
  _openMonthlyReportPicker() {
    if (!this.refs?.monthlyReportBtn) return;
    openDateRangePicker({
      anchor: this.refs.monthlyReportBtn,
      onApply: (startMs, endMs) => this._exportMonthlyReport(startMs, endMs)
    });
  }

  /**
   * Downloads a CSV scoped to one date range: assets added in that window,
   * how much activity happened (and of what kind), and the activity log
   * itself — same Warehouse filter as _exportSummary respects, so a
   * scoped report for one site only ever counts that site's own gadgets.
   * Deliberately a *separate* export from _exportSummary rather than a
   * date filter bolted onto it: that one is a point-in-time inventory
   * snapshot (nothing here has a "when" to filter by beyond right now),
   * this one is inherently about a span of time — mixing the two would
   * make "Total Gadgets" or "Warehouse Locations" look like they're also
   * scoped to the range, when a location or a still-owned gadget has no
   * created/updated timestamp that would even make sense to filter on.
   */
  _exportMonthlyReport(startMs, endMs) {
    const gadgets = this._filteredGadgets();
    const addedInRange = gadgets.filter((g) => g.createdAt >= startMs && g.createdAt <= endMs);
    const activityInRange = this._recentActivity(gadgets, Infinity)
      .filter((e) => e.timestamp >= startMs && e.timestamp <= endMs)
      .sort((a, b) => a.timestamp - b.timestamp); // oldest first reads like a timeline in the exported file

    if (activityInRange.length === 0 && addedInRange.length === 0) {
      Toast.show('Nothing happened in that date range — no report to export.');
      return;
    }

    const activityByType = this._countBy(activityInRange, (e) => activityTypeLabel(e.type));

    const rows = [];
    rows.push(['Report Period', 'Start', fmtLocalDateStamp(new Date(startMs)), '']);
    rows.push(['Report Period', 'End', fmtLocalDateStamp(new Date(endMs)), '']);
    rows.push(['Report Period', 'Warehouse Filter', this._effectiveOwnerFilter() === 'all' ? 'All' : this._effectiveOwnerFilter(), '']);
    rows.push(['Summary', 'Assets Added in Period', addedInRange.length, '']);
    rows.push(['Summary', 'Activity Entries in Period', activityInRange.length, '']);
    activityByType.forEach((r) => rows.push(['Activity by Type', r.label, r.count, '']));
    activityInRange.forEach((e) => rows.push(['Activity', e.message, fmtLocalDateTime(e.timestamp), `${e.assetLabel} — by ${e.performedBy || 'Unknown'}`]));

    const csv = toCsv(['Section', 'Label', 'Count', 'Assigned'], rows);
    downloadCsv(csv, `stockroom-monthly-report-${fmtLocalDateStamp(new Date(startMs))}-to-${fmtLocalDateStamp(new Date(endMs))}.csv`);
    Toast.success(`Exported ${activityInRange.length} activity entr${activityInRange.length === 1 ? 'y' : 'ies'} and ${addedInRange.length} new asset${addedInRange.length === 1 ? '' : 's'} for ${fmtLocalDateStamp(new Date(startMs))} to ${fmtLocalDateStamp(new Date(endMs))}.`);
  }
}