import { Modal } from '../../components/Modal.js';
import { Toast } from '../../components/Toast.js';
import { confirmDialog } from '../../components/ConfirmDialog.js';
import { buildTransferForm } from '../../components/TransferForm.js';
import { openLogModal } from '../../components/LogModal.js';
import { openManifestModal as showManifestModal } from '../../components/ManifestModal.js';
import { openDropdownMenu } from '../../components/DropdownMenu.js';
import { enhanceSelect } from '../../components/SelectField.js';
import { Gadget, TEMP_POSITION_TYPES, temporaryPositionLabel } from '../../models/Gadget.js';
import { buildManageForm } from './ManageForm.js';
import { toCsv, parseCsv, downloadCsv, readCsvFile } from '../../utils/csv.js';
import { processInChunks } from '../../utils/asyncBatch.js';
import { buildImportProgress } from '../../components/ImportProgress.js';
import { el, esc } from '../../utils/dom.js';
import { getOperatorName } from '../../core/Operator.js';
import { can } from '../../core/Permissions.js';
import { isWarehouseAllowed, isWarehouseScoped } from '../../core/WarehouseScope.js';
import { fmtLocalDateTime, fmtLocalDateStamp } from '../../utils/format.js';
import { resolveMerchantPlacement, destinationWarehouseId } from '../../utils/merchantPlacement.js';

/** Column order/labels shared by the CSV export, the import template, and the importer. */
const IMPORT_HEADERS = ['User', 'Role', 'Category', 'Serial Number', 'Warehouse Asset Tag', 'Asset Tag (Default)', 'MAC Address', 'Merchant', 'Owner', 'Remarks', 'Description'];

/**
 * ManageController is the feature's entry point: it owns UI state
 * (filters/sort/pagination/selection), talks to the Store for CRUD, and
 * delegates all rendering to ManageView. Modal/Toast/ConfirmDialog/
 * TransferForm/LogModal/DropdownMenu are generic components reused as-is.
 */
export class ManageController {
  constructor({ store, view, refs, inventoryAssetStore, warehouseStore, locationStore }) {
    this.store = store;
    this.view = view;
    this.refs = refs;
    // Read-only reference to the Inventory Assets module, which is the
    // source of truth for category/serial/MAC/asset-tag suggestions in
    // the add/edit form (see _openGadgetModal). Manage never writes to it.
    this.inventoryAssetStore = inventoryAssetStore;
    // Read-only reference to Warehouse Information (Settings). This is
    // the authoritative registry of warehouse sites — the source for
    // both the warehouse filter dropdown and the side tab bar — so a
    // warehouse shows up as filterable the moment it's added in
    // Settings, even before any asset has been assigned to it.
    this.warehouseStore = warehouseStore;
    // Read-only reference to Warehouse Information's created locations
    // (Settings → a warehouse's zone → "create warehouse location").
    // Merchant is the key: whenever a gadget's merchant is set to a name
    // that matches one of these locations' codes, Position Type /
    // Warehouse / Owner are derived from where that location lives (see
    // utils/merchantPlacement.js) instead of being typed by hand.
    this.locationStore = locationStore;

    this.state = {
      filters: { keyword: '', category: 'all', owner: 'all', serialNumber: '', macAddress: '', pendingOnly: false },
      sortBy: 'user',
      sortDir: 'asc',
      page: 1,
      pageSize: 50
    };
    this.selected = new Set();

    this.store.on('change', () => this.render());
    this.warehouseStore?.on('change', () => this.render());
    this.locationStore?.on('change', () => this.render());
    this._bindFilterBar();
    this._bindActionBar();
    this._bindTableHead();
    this._bindFooter();
  }

  init() {
    this.render();

    // A one-time nudge for anyone whose User Group is specifically bound
    // to a warehouse a transfer is waiting on. Deliberately scoped to
    // *warehouse-restricted* sessions only, not everything
    // manage.confirm-transfers could act on — an unrestricted account
    // with oversight access doesn't need a toast every time they sign in
    // for transfers that aren't really theirs to chase (see
    // _pendingTransfersForMe).
    const mine = this._pendingTransfersForMe();
    if (mine.length > 0) {
      Toast.show(`You have ${mine.length} transfer${mine.length === 1 ? '' : 's'} awaiting your confirmation.`);
    }
  }

  // ---------- Derived data ----------
  _knownCategories() {
    return [...new Set(this.store.list().map((g) => g.category).filter(Boolean))].sort();
  }

  /**
   * Warehouse names for the transfer-destination suggestions: every site
   * configured in Warehouse Information, unioned with any warehouse name
   * already sitting on an asset record (covers legacy/free-typed names
   * from before a site was formally added there). Deduped and sorted
   * either way.
   */
  _knownWarehouses() {
    const fromSettings = this.warehouseStore?.list().map((w) => w.name) || [];
    const fromAssets = this.store.list().map((g) => g.warehouse);
    return [...new Set([...fromSettings, ...fromAssets].filter(Boolean))].sort();
  }

  /**
   * Pending transfers into a warehouse this session's User Group is
   * specifically bound to — the "personal inbox" count used for the
   * onload toast. Deliberately '' for an *unrestricted* session (no
   * group, or a group with no "Bind warehouse" list) rather than
   * treating unrestricted-so-technically-allowed as "mine, personally" —
   * that's oversight access, not a job assignment, and toasting
   * oversight holders for every transfer app-wide on every sign-in would
   * be noise, not a nudge. See core/WarehouseScope.js's isWarehouseScoped.
   */
  _pendingTransfersForMe() {
    if (!isWarehouseScoped()) return [];
    return this.store.list().filter((g) => g.pendingTransfer && isWarehouseAllowed(g.pendingTransfer.toWarehouseId));
  }

  /** Every pending transfer this session is actually allowed to confirm/cancel — assigned-to-me ones plus, for manage.confirm-transfers holders, everyone else's too. Drives the toolbar badge count and the "Pending transfers" quick filter. */
  _pendingTransfersActionable() {
    return this.store.list().filter((g) => g.pendingTransfer && this._canActOnPendingTransfer(g));
  }

  /** Shows/hides and labels the "Pending transfers (n)" toolbar toggle — visible whenever there's something to act on, or while the filter itself is switched on (so it stays reachable to turn back off even if the count just dropped to zero). */
  _updatePendingTransfersButton() {
    if (!this.refs.pendingTransfersBtn) return;
    const count = this._pendingTransfersActionable().length;
    const active = this.state.filters.pendingOnly;
    const show = count > 0 || active;
    this.refs.pendingTransfersBtn.style.display = show ? '' : 'none';
    if (this.refs.pendingTransfersSep) this.refs.pendingTransfersSep.style.display = show ? '' : 'none';
    this.refs.pendingTransfersBtn.textContent = `Pending transfers (${count})`;
    this.refs.pendingTransfersBtn.classList.toggle('active', active);
  }

  /**
   * Warehouse names for the side filter button's flyout — every real site
   * configured in Warehouse Information (Settings), not just whatever
   * Owner values happen to already be sitting on a Manage record. A
   * warehouse should be filterable — and show up as "active" once
   * selected — the moment it exists in Settings, even before any asset
   * has actually been assigned to it. Filtering itself still matches
   * against each record's `owner` field (see _filteredSortedGadgets);
   * this only changes where the *option list* comes from.
   *
   * When the signed-in session is warehouse-scoped (its User Group has a
   * non-empty "Bind warehouse" list — see core/WarehouseScope.js), this
   * is also where that restriction is enforced: only bound warehouses
   * ever appear as an option here, full stop.
   */
  _knownOwners() {
    if (!this.warehouseStore) return [];
    return this.warehouseStore.list()
      .filter((w) => isWarehouseAllowed(w.id))
      .map((w) => w.name).filter(Boolean).sort();
  }

  /**
   * The owner filter actually in effect: the person's own selection,
   * except when they're scoped to exactly one warehouse — in that case
   * there's nothing to choose between, so that single warehouse is
   * applied automatically rather than making "All" a meaningless extra
   * click. See _openWarehouseFilterMenu() for the matching "All" option
   * being hidden in that same case.
   */
  _effectiveOwnerFilter() {
    const owners = this._knownOwners();
    if (isWarehouseScoped() && owners.length === 1) return owners[0];
    return this.state.filters.owner;
  }

  /** Created warehouse location names (e.g. "Samples", "Test Location") —
   * the merchant values that actually resolve to a Position Type /
   * Warehouse / Owner. Suggested in the Merchant field's datalist. */
  _locationCodes() {
    return this.locationStore ? [...new Set(this.locationStore.list().map((l) => l.locationCode).filter(Boolean))].sort() : [];
  }

  /** Resolves a merchant name against created locations — see
   * utils/merchantPlacement.js. Bound to this controller's stores so
   * ManageForm's live preview and the actual save-time derivation both
   * go through the exact same lookup. */
  _resolvePlacement(merchant) {
    return resolveMerchantPlacement(merchant, { locationStore: this.locationStore, warehouseStore: this.warehouseStore });
  }

  /** Serial numbers (lowercased, trimmed) that appear on more than one record, inventory-wide. */
  _duplicateSerialSet() {
    const counts = new Map();
    this.store.list().forEach((g) => {
      const key = (g.serialNumber || '').trim().toLowerCase();
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
  }

  /**
   * Serial numbers (lowercased, trimmed) already assigned to some Manage
   * record — used to keep the add/edit form from suggesting a serial that
   * would just trigger the duplicate-serial error anyway. Excludes the
   * gadget currently being edited, if any, so its own serial isn't
   * filtered out of its own suggestion list.
   */
  _usedSerialSet(excludeGadgetId = null) {
    const used = new Set();
    this.store.list().forEach((g) => {
      if (g.id === excludeGadgetId) return;
      const key = (g.serialNumber || '').trim().toLowerCase();
      if (key) used.add(key);
    });
    return used;
  }

  /**
   * Maps gadget id -> catalog issues, for records already saved in Manage
   * whose category/serial/asset tag don't (or no longer) match Inventory
   * Assets — e.g. saved before that catalog entry existed, or the catalog
   * entry was since edited or removed. Only entries with at least one
   * issue are included, so most renders return an empty map.
   */
  _catalogIssuesById() {
    const map = new Map();
    this.store.list().forEach((g) => {
      const issues = this._catalogIssues({ category: g.category, serialNumber: g.serialNumber, assetTagDefault: g.assetTagDefault, macAddress: g.macAddress });
      if (issues.category || issues.serialNumber || issues.assetTagDefault || issues.macAddress) {
        map.set(g.id, issues);
      }
    });
    return map;
  }

  _filteredSortedGadgets() {
    const f = this.state.filters;
    const kw = f.keyword.trim().toLowerCase();
    const serial = f.serialNumber.trim().toLowerCase();
    const mac = f.macAddress.trim().toLowerCase();
    const ownerFilter = this._effectiveOwnerFilter();
    // When scoped, "All" still only ever means "all of MY warehouses" —
    // this is what actually enforces that, on top of whatever single
    // warehouse (or "all") the person picked from the flyout. An
    // unassigned asset (ownerKey === 'Unassigned') isn't excluded by
    // this, even though 'Unassigned' is never itself in _knownOwners():
    // it doesn't belong to any *other* warehouse either, so hiding it
    // from every scoped group would make it invisible to everyone —
    // nobody could ever claim it into their own warehouse.
    //
    // A gadget with a pending transfer *into* one of this session's
    // warehouses is also let through, even while its current owner is
    // still a warehouse outside scope — otherwise the very receiver
    // assigned to confirm it (who's typically scoped to the destination
    // warehouse, not the source one) could never find the row to act on
    // it. Ownership hasn't moved yet, so it stays counted under its old
    // owner everywhere else (Reports, the Owner column, etc.) — this is
    // strictly about visibility for the pending receiver.
    const allowedOwners = isWarehouseScoped() ? new Set(this._knownOwners()) : null;

    let gadgets = this.store.list().filter((g) => {
      if (f.category !== 'all' && g.category !== f.category) return false;
      if (f.pendingOnly && (!g.pendingTransfer || !this._canActOnPendingTransfer(g))) return false;
      const ownerKey = g.owner || 'Unassigned';
      const pendingToOwner = g.pendingTransfer?.toOwner;
      if (allowedOwners && ownerKey !== 'Unassigned' && !allowedOwners.has(ownerKey)) {
        if (!pendingToOwner || !allowedOwners.has(pendingToOwner)) return false;
      }
      // Same exception as the scope check just above, for the same
      // reason: a scoped session with exactly one bound warehouse gets
      // that warehouse auto-applied as the owner filter (see
      // _effectiveOwnerFilter), and this asset's *current* owner is
      // still its old warehouse — ownership hasn't moved yet, that's the
      // whole point of "pending". Without this, the scope check above
      // lets the row through, and this very next check silently excluded
      // it again right after — the practical effect was that a pending
      // transfer was only ever visible to an unscoped ("Bound Warehouse:
      // all") session, since that's the only case where ownerFilter is
      // 'all' and this check is skipped entirely.
      if (ownerFilter !== 'all' && ownerKey !== ownerFilter && pendingToOwner !== ownerFilter) return false;
      if (serial && !g.serialNumber.toLowerCase().includes(serial)) return false;
      if (mac && !g.macAddress.toLowerCase().includes(mac)) return false;
      if (kw) {
        const haystack = [g.user, g.role, g.category, g.serialNumber, g.warehouseAssetTag, g.assetTagDefault, g.macAddress, g.warehouse, g.owner, g.remarks, g.description]
          .join(' ').toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      return true;
    });

    const dir = this.state.sortDir === 'asc' ? 1 : -1;
    gadgets = gadgets.slice().sort((a, b) => {
      let va, vb;
      switch (this.state.sortBy) {
        case 'role': va = a.role.toLowerCase(); vb = b.role.toLowerCase(); break;
        case 'category': va = a.category.toLowerCase(); vb = b.category.toLowerCase(); break;
        case 'warehouse': va = (a.warehouse || '').toLowerCase(); vb = (b.warehouse || '').toLowerCase(); break;
        case 'createdAt': va = a.createdAt; vb = b.createdAt; break;
        case 'updatedAt': va = a.updatedAt; vb = b.updatedAt; break;
        default: va = (a.user || '').toLowerCase(); vb = (b.user || '').toLowerCase();
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return gadgets;
  }

  // ---------- Rendering ----------
  render() {
    const allIds = new Set(this.store.list().map((g) => g.id));
    this.selected.forEach((id) => { if (!allIds.has(id)) this.selected.delete(id); });

    const filtered = this._filteredSortedGadgets();
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / this.state.pageSize));
    if (this.state.page > totalPages) this.state.page = totalPages;
    if (this.state.page < 1) this.state.page = 1;

    const start = (this.state.page - 1) * this.state.pageSize;
    const pageGadgets = filtered.slice(start, start + this.state.pageSize);

    this.view.renderFilterOptions(this._knownCategories(), this.state.filters);
    this.view.renderWarehouseFilterButton(this._knownOwners().length > 0, this._effectiveOwnerFilter());
    this._updatePendingTransfersButton();
    this.view.renderTable(pageGadgets, this.selected, {
      onEdit: (id) => this.openEditModal(id),
      onTransfer: (id) => this.openTransferModal(id),
      onViewLog: (id) => this.viewLog(id),
      onDelete: (id) => this.deleteGadget(id),
      onConfirmTransfer: (id) => this._confirmTransferWithPrompt(id),
      onCancelTransfer: (id) => this._cancelTransferWithPrompt(id),
      onToggleSelect: (id, checked) => this._toggleSelect(id, checked),
      onToggleSelectAll: (checked) => this._toggleSelectAll(pageGadgets, checked),
      onRerender: () => this.render()
    }, this._duplicateSerialSet(), this._catalogIssuesById(), {
      canEdit: can('manage.edit'),
      canViewLog: can('manage.view-log'),
      canDelete: can('manage.delete'),
      canActOnTransfer: (gadget) => this._canActOnPendingTransfer(gadget)
    });
    this.view.renderSortHeaders(this.state.sortBy, this.state.sortDir);
    this.view.renderFooter(
      { totalItems, selectedCount: this.selected.size, page: this.state.page, pageSize: this.state.pageSize, totalPages },
      {
        onPrevPage: () => this._goToPage(this.state.page - 1),
        onNextPage: () => this._goToPage(this.state.page + 1),
        onPageClick: (page) => this._goToPage(page),
        onPageSizeChange: (size) => { this.state.pageSize = size; this.state.page = 1; this.render(); },
        onGotoPage: (page) => this._goToPage(page)
      }
    );
    this._updateBulkDeleteVisibility();
    this._applyActionBarPermissions();
  }

  _goToPage(page) {
    this.state.page = page;
    this.render();
  }

  /** Opens the "Warehouse" button's flyout: a DropdownMenu (same singleton
   * used everywhere else in the app) listing "All" plus every warehouse
   * configured in Warehouse Information. Picking one filters the table to
   * records whose `owner` matches that warehouse's name — see
   * _knownOwners() for why the option list is sourced from Settings
   * rather than from whatever's already on Manage's own records.
   *
   * The "All" entry itself is only offered when it means something: when
   * the session isn't warehouse-scoped at all, or it's bound to more
   * than one warehouse. Scoped to exactly one, there's nothing to pick
   * between — see _effectiveOwnerFilter(), which applies that single
   * warehouse automatically instead. */
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
    this.state.page = 1;
    this.render();
  }

  // ---------- Selection ----------
  _toggleSelect(id, checked) {
    if (checked) this.selected.add(id);
    else this.selected.delete(id);
    this.render();
  }

  _toggleSelectAll(pageGadgets, checked) {
    pageGadgets.forEach((g) => {
      if (checked) this.selected.add(g.id);
      else this.selected.delete(g.id);
    });
    this.render();
  }

  _updateBulkDeleteVisibility() {
    const show = this.selected.size > 0;
    const showDelete = show && can('manage.delete-selected');
    const showManifest = show && can('manage.preview-manifest');
    const showAdjust = show && can('manage.adjust-position');
    this.refs.bulkDeleteBtn.style.display = showDelete ? '' : 'none';
    this.refs.bulkDeleteSep.style.display = showDelete ? '' : 'none';
    this.refs.manifestBtn.style.display = showManifest ? '' : 'none';
    this.refs.manifestSep.style.display = showManifest ? '' : 'none';
    this.refs.transferItemBtn.style.display = showAdjust ? '' : 'none';
    this.refs.transferItemSep.style.display = showAdjust ? '' : 'none';
  }

  /** Add/Import/Clear-all are always visible (unlike the selection-triggered
   * trio above) — denied ones stay visible but disabled, same reasoning as
   * the row-action buttons: it's clear the option exists, just not to this
   * group. */
  _applyActionBarPermissions() {
    const canAdd = can('manage.add');
    const canImport = can('manage.import');
    const canClear = can('manage.clear-all');

    // addItemBtn's menu offers both Add and Import (see _openAddOptionsMenu) —
    // only disable the trigger itself if neither is allowed.
    this.refs.addItemBtn.disabled = !canAdd && !canImport;
    this.refs.addItemBtn.title = this.refs.addItemBtn.disabled ? 'You do not have permission to add or import assets.' : '';
    if (this.refs.emptyAddBtn) {
      this.refs.emptyAddBtn.disabled = !canAdd;
      this.refs.emptyAddBtn.title = canAdd ? '' : 'You do not have permission to add assets.';
    }
    this.refs.clearAllBtn.disabled = !canClear;
    this.refs.clearAllBtn.title = canClear ? '' : 'You do not have permission to clear all data.';
  }

  async _deleteSelected() {
    if (!can('manage.delete-selected')) return;
    const count = this.selected.size;
    if (count === 0) return;
    const ok = await confirmDialog({
      title: 'Remove selected assets',
      message: `Remove ${count} selected ${count === 1 ? 'asset' : 'assets'} from inventory? This cannot be undone.`,
      confirmLabel: 'Remove',
      danger: true
    });
    if (!ok) return;
    this.selected.forEach((id) => this.store.delete(id));
    this.selected.clear();
    Toast.show(`Removed ${count} ${count === 1 ? 'asset' : 'assets'}.`);
  }

  // ---------- Filter bar bindings ----------
  _bindFilterBar() {
    const applyOnEnter = (el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._applyFilters(); });
    applyOnEnter(this.refs.filterKeyword);
    applyOnEnter(this.refs.filterSerial);
    applyOnEnter(this.refs.filterMac);

    // Dropdowns apply immediately on selection — there's no "typing in progress"
    // state to wait out, so requiring a separate Search click just makes them
    // look broken.
    this.refs.filterCategory.addEventListener('change', () => this._applyFilters());

    this.refs.searchBtn.addEventListener('click', () => this._applyFilters());
    this.refs.resetBtn.addEventListener('click', () => this._resetFilters());
    this.refs.warehouseFilterBtn?.addEventListener('click', () => this._openWarehouseFilterMenu());
    this.refs.pendingTransfersBtn?.addEventListener('click', () => {
      this.state.filters.pendingOnly = !this.state.filters.pendingOnly;
      this.state.page = 1;
      this.render();
    });
  }

  _applyFilters() {
    this.state.filters = {
      keyword: this.refs.filterKeyword.value,
      category: this.refs.filterCategory.value,
      owner: this.state.filters.owner,
      serialNumber: this.refs.filterSerial.value,
      macAddress: this.refs.filterMac.value,
      pendingOnly: this.state.filters.pendingOnly
    };
    this.state.page = 1;
    this.render();
  }

  _resetFilters() {
    this.refs.filterKeyword.value = '';
    this.refs.filterSerial.value = '';
    this.refs.filterMac.value = '';
    this.state.filters = { keyword: '', category: 'all', owner: 'all', serialNumber: '', macAddress: '', pendingOnly: false };
    this.state.page = 1;
    this.render();
  }

  // ---------- Action bar / table head bindings ----------
  _bindActionBar() {
    this.refs.addItemBtn.addEventListener('click', () => this._openAddOptionsMenu());
    this.refs.emptyAddBtn.addEventListener('click', () => this.openAddModal());
    this.refs.exportBtn.addEventListener('click', () => this._openExportMenu());
    this.refs.clearAllBtn.addEventListener('click', () => this.clearAll());
    this.refs.bulkDeleteBtn.addEventListener('click', () => this._deleteSelected());
    this.refs.manifestBtn.addEventListener('click', () => this.openManifestModal());
    this.refs.transferItemBtn.addEventListener('click', () => this._openAdjustPositionMenu());
    this.refs.refreshBtn.addEventListener('click', () => this.render());
    this.refs.importFileInput.addEventListener('change', (e) => this._handleImportFile(e));
  }

  /** "+ Add asset" now branches into two paths: a manual entry (Add Manage,
   * same modal/logic as before) or a bulk CSV Import. */
  _openAddOptionsMenu() {
    const items = [];
    if (can('manage.add')) items.push({ label: 'Add Manage', onClick: () => this.openAddModal() });
    if (can('manage.import')) items.push({ label: 'Import', onClick: () => this.openImportModal() });
    if (items.length === 0) return;
    openDropdownMenu({ anchor: this.refs.addItemBtn, items });
  }

  _bindTableHead() {
    this.refs.tableHead.querySelectorAll('th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort');
        if (this.state.sortBy === key) {
          this.state.sortDir = this.state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          this.state.sortBy = key;
          this.state.sortDir = 'asc';
        }
        this.render();
      });
    });
  }

  _bindFooter() {
    // Pagination controls are re-bound on every render() via ManageView.renderFooter,
    // since page count / totals change with the data. Nothing static to bind here.
  }

  // ---------- CRUD orchestration ----------
  openAddModal() {
    if (!can('manage.add')) return;
    this._openGadgetModal(null);
  }

  openEditModal(id) {
    if (!can('manage.edit')) return;
    const gadget = this.store.get(id);
    if (gadget) this._openGadgetModal(gadget);
  }

  _knownUsers() {
    return [...new Set(this.store.list().map((g) => g.user).filter(Boolean))].sort();
  }

  /**
   * Checks category / serialNumber / assetTagDefault against the
   * Inventory Assets catalog (source of truth). Returns { category,
   * serialNumber, assetTagDefault }, each either null (fine) or a
   * message describing the mismatch.
   *
   * If a serial number is given, category and asset tag must both agree
   * with THAT SAME catalog record — a real serial can't be paired with a
   * category or tag lifted from a different device. With no serial
   * given, category and asset tag are each checked independently against
   * whatever values exist anywhere in the catalog.
   */
  /**
   * Checks category / serialNumber / assetTagDefault / macAddress against
   * the Inventory Assets catalog (source of truth). Returns { category,
   * serialNumber, assetTagDefault, macAddress }, each either null (fine)
   * or a message describing the mismatch.
   *
   * If a serial number is given, the other three must all agree with
   * THAT SAME catalog record — a real serial can't be paired with a
   * category, tag, or MAC lifted from a different device. With no serial
   * given, each is checked independently against whatever values exist
   * anywhere in the catalog.
   */
  _catalogIssues({ category, serialNumber, assetTagDefault, macAddress }) {
    const assets = this.inventoryAssetStore ? this.inventoryAssetStore.list() : [];
    const issues = { category: null, serialNumber: null, assetTagDefault: null, macAddress: null };
    const serial = (serialNumber || '').trim();

    if (serial) {
      const match = assets.find((a) => (a.serialNumber || '').trim() === serial);
      if (!match) {
        issues.serialNumber = 'This serial number was not found in Inventory Assets.';
        if (category) issues.category = 'Can\'t verify category — this serial number isn\'t in Inventory Assets.';
        if (assetTagDefault) issues.assetTagDefault = 'Can\'t verify asset tag — this serial number isn\'t in Inventory Assets.';
        if (macAddress) issues.macAddress = 'Can\'t verify MAC address — this serial number isn\'t in Inventory Assets.';
      } else {
        if (category && match.category !== category) {
          issues.category = `Inventory Assets lists this serial under "${match.category}", not "${category}".`;
        }
        if (assetTagDefault && match.assetTag !== assetTagDefault) {
          issues.assetTagDefault = match.assetTag
            ? `Inventory Assets lists this serial's tag as "${match.assetTag}", not "${assetTagDefault}".`
            : 'Inventory Assets has no asset tag on file for this serial number.';
        }
        if (macAddress && (match.macAddress || '').toLowerCase() !== macAddress.toLowerCase()) {
          issues.macAddress = match.macAddress
            ? `Inventory Assets lists this serial's MAC address as "${match.macAddress}", not "${macAddress}".`
            : 'Inventory Assets has no MAC address on file for this serial number.';
        }
      }
    } else {
      if (category && !assets.some((a) => a.category === category)) {
        issues.category = 'This category does not exist in Inventory Assets.';
      }
      if (assetTagDefault && !assets.some((a) => a.assetTag === assetTagDefault)) {
        issues.assetTagDefault = 'This asset tag does not exist in Inventory Assets.';
      }
      if (macAddress && !assets.some((a) => (a.macAddress || '').toLowerCase() === macAddress.toLowerCase())) {
        issues.macAddress = 'This MAC address does not exist in Inventory Assets.';
      }
    }

    return issues;
  }

  /** True if any of category/serialNumber/assetTagDefault/macAddress fails catalog validation. */
  _hasCatalogIssue(fields) {
    const issues = this._catalogIssues(fields);
    return Boolean(issues.category || issues.serialNumber || issues.assetTagDefault || issues.macAddress);
  }

  _openGadgetModal(gadget) {
    const inventoryAssets = this.inventoryAssetStore ? this.inventoryAssetStore.list() : [];
    // Field-level permissions under Manage → Edit (see models/UserGroup.js's
    // PERMISSION_TREE) — only apply to an *existing* asset; adding a
    // brand-new one is unrestricted either way, since there's nothing yet
    // for a wrong value to disagree with.
    const fieldPermKeys = {
      category: 'manage.edit.category',
      serialNumber: 'manage.edit.serial-number',
      macAddress: 'manage.edit.mac-address',
      assetTagDefault: 'manage.edit.asset-tag-default',
      merchant: 'manage.edit.merchant',
      remarks: 'manage.edit.remarks'
    };
    const lockedFields = gadget
      ? Object.entries(fieldPermKeys).filter(([, key]) => !can(key)).map(([field]) => field)
      : [];
    const form = buildManageForm(gadget, {
      userOptions: this._knownUsers(),
      inventoryAssets,
      usedSerials: this._usedSerialSet(gadget ? gadget.id : null),
      locationCodes: this._locationCodes(),
      resolvePlacement: (merchant) => this._resolvePlacement(merchant),
      lockedFields
    });

    const modal = new Modal({
      title: gadget ? 'Edit asset' : 'Add asset',
      body: form.node,
      footer: [
        { label: 'Cancel', variant: 'btn-outline', onClick: (m) => m.close() },
        {
          label: 'Save asset',
          variant: 'btn-accent',
          onClick: (m) => {
            const raw = form.getData();
            const existingGadgets = this.store.list().filter((g) => !gadget || g.id !== gadget.id);
            const { valid, errors } = Gadget.validate(raw, { existingGadgets });
            const catalogIssues = this._catalogIssues(raw);
            const hasCatalogIssue = Boolean(catalogIssues.category || catalogIssues.serialNumber || catalogIssues.assetTagDefault || catalogIssues.macAddress);
            if (!valid || hasCatalogIssue) {
              form.showErrors({
                ...errors,
                ...(catalogIssues.category ? { category: catalogIssues.category } : {}),
                ...(catalogIssues.serialNumber ? { serialNumber: catalogIssues.serialNumber } : {}),
                ...(catalogIssues.assetTagDefault ? { assetTagDefault: catalogIssues.assetTagDefault } : {}),
                ...(catalogIssues.macAddress ? { macAddress: catalogIssues.macAddress } : {})
              });
              return;
            }
            this._saveGadget(gadget, raw);
            m.close();
          }
        }
      ]
    });
    modal.open();
    form.focusFirst();
  }

  _saveGadget(existingGadget, raw) {
    const inventoryAssets = this.inventoryAssetStore ? this.inventoryAssetStore.list() : [];
    const serial = (raw.serialNumber || '').trim();
    // Same match _catalogIssues() already validates against — this just
    // additionally *persists* it as a real foreign key (see
    // models/Gadget.js's inventoryAssetId) instead of only ever
    // re-deriving the relationship at validation/render time.
    const matchedAsset = serial ? inventoryAssets.find((a) => (a.serialNumber || '').trim() === serial) : null;

    const payload = {
      user: raw.user,
      role: raw.role,
      category: raw.category || 'Uncategorized',
      serialNumber: raw.serialNumber,
      macAddress: raw.macAddress,
      warehouseAssetTag: raw.warehouseAssetTag,
      assetTagDefault: raw.assetTagDefault,
      password: raw.password,
      merchant: raw.merchant,
      remarks: raw.remarks,
      description: raw.description,
      inventoryAssetId: matchedAsset ? matchedAsset.id : null
    };

    // Merchant is the key for Position Type / Warehouse / Owner (see
    // utils/merchantPlacement.js): only recompute them when the merchant
    // actually changed (a new gadget always counts as "changed"), and
    // leave them alone otherwise so unrelated edits — e.g. just fixing a
    // remark — don't quietly wipe out a placement set by the Transfer
    // action. A changed merchant that no longer resolves to any created
    // location clears the three fields to unassigned rather than leaving
    // a stale placement from whatever the merchant used to be.
    //
    // Receiving (Task 1): if the *new* merchant resolves to a real
    // created location, the change doesn't apply here at all —
    // merchant/positionType/warehouse/owner all stay exactly as they
    // were, and the request goes into pendingTransfer for whoever's User
    // Group is bound to that destination warehouse (or someone with
    // manage.confirm-transfers) to confirm via confirmTransfer() below.
    // Only an *existing* asset can go through this — a brand-new asset
    // has no current merchant to transfer away from, so filling in
    // Merchant while adding one is an initial placement, not a transfer.
    const merchantChanged = !existingGadget || existingGadget.merchant !== raw.merchant;
    let placement = { matched: false };
    let requiresConfirmation = false;
    // Preserved by default — editing some *other* field shouldn't disturb
    // a transfer this asset is already waiting on.
    let pendingTransfer = existingGadget ? existingGadget.pendingTransfer : null;

    if (merchantChanged) {
      placement = this._resolvePlacement(raw.merchant);
      requiresConfirmation = Boolean(existingGadget) && placement.matched;

      if (requiresConfirmation) {
        payload.merchant = existingGadget.merchant;
        payload.positionType = existingGadget.positionType;
        payload.warehouse = existingGadget.warehouse;
        payload.owner = existingGadget.owner;
        pendingTransfer = {
          toMerchant: raw.merchant,
          toPositionType: placement.positionType,
          toWarehouse: placement.warehouse,
          toOwner: placement.owner,
          toWarehouseId: destinationWarehouseId(placement),
          requestedAt: Date.now(),
          requestedBy: getOperatorName()
        };
      } else {
        payload.positionType = placement.matched ? placement.positionType : '';
        payload.warehouse = placement.matched ? placement.warehouse : '';
        payload.owner = placement.matched ? placement.owner : '';
        // A direct, ungated merchant change (nothing resolved, or a
        // brand-new asset) supersedes any stale pending request left
        // over from before — the merchant is being set right now, not
        // queued.
        pendingTransfer = null;
      }
    }
    payload.pendingTransfer = pendingTransfer;

    if (existingGadget) {
      this._logFieldChanges(existingGadget, payload, merchantChanged, requiresConfirmation);
      this.store.update(existingGadget.id, payload);
      Toast.success(requiresConfirmation
        ? `Saved changes for ${payload.user || 'this asset'}. Transfer to '${raw.merchant}' is pending confirmation from anyone with access to ${pendingTransfer.toOwner}.`
        : `Saved changes for ${payload.user || 'this asset'}.`);
    } else {
      const gadget = new Gadget(payload);
      gadget.addLogEntry('Asset added to inventory.', 'create', null, getOperatorName());
      if (payload.merchant) {
        const note = placement.matched
          ? `Merchant '${payload.merchant}' resolved to ${payload.positionType} · ${payload.warehouse} · ${payload.owner}.`
          : `Merchant '${payload.merchant}' does not match any created warehouse location — position left unassigned.`;
        gadget.addLogEntry(note, 'transfer', { from: '', to: payload.merchant }, getOperatorName());
      }
      this.store.create(gadget);
      Toast.success(`Added asset for ${payload.user || 'unassigned user'}.`);
    }
  }

  /**
   * Compares the record's current values against the incoming payload
   * *before* the store overwrites them, and writes typed log entries so
   * LogModal's Users/Remarks tabs have something to show. Warehouse
   * transfers made through the Transfer action are logged separately by
   * openTransferModal/openBulkWarehouseTransferModal; `merchantChanged`
   * covers the merchant-driven Position Type/Warehouse/Owner resolution
   * that happens right here in _saveGadget — `requiresConfirmation`
   * further splits that into "applied immediately" vs. "queued, awaiting
   * the assigned receiver" (see confirmTransfer/cancelPendingTransfer for
   * the log entries written once that's resolved either way).
   */
  _logFieldChanges(gadget, payload, merchantChanged, requiresConfirmation) {
    if (gadget.user !== payload.user) {
      const from = gadget.user || 'Unassigned';
      const to = payload.user || 'Unassigned';
      gadget.addLogEntry(`Reassigned from ${from} to ${to}.`, 'user', { from, to }, getOperatorName());
    }
    if (merchantChanged && requiresConfirmation) {
      const p = payload.pendingTransfer;
      gadget.addLogEntry(
        `Transfer requested: merchant '${gadget.merchant || 'None'}' → '${p.toMerchant}'. Resolved to ${p.toPositionType} · ${p.toWarehouse} · ${p.toOwner}. Awaiting confirmation from anyone with access to ${p.toOwner}.`,
        'transfer',
        { from: gadget.merchant || '', to: p.toMerchant },
        getOperatorName()
      );
    } else if (merchantChanged) {
      const from = gadget.merchant || 'None';
      const to = payload.merchant || 'None';
      const placementNote = payload.positionType
        ? ` Resolved to ${payload.positionType} · ${payload.warehouse} · ${payload.owner}.`
        : ' No matching warehouse location — position left unassigned.';
      gadget.addLogEntry(`Transferred merchant from '${from}' to '${to}'.${placementNote}`, 'transfer', { from: gadget.merchant || '', to: payload.merchant || '' }, getOperatorName());
    }
    if (gadget.remarks !== payload.remarks) {
      gadget.addLogEntry(payload.remarks ? `Remarks updated: "${payload.remarks}"` : 'Remarks cleared.', 'remarks', null, getOperatorName());
    }
    const otherFieldsChanged = ['role', 'category', 'serialNumber', 'macAddress', 'warehouseAssetTag', 'assetTagDefault', 'password', 'description']
      .some((key) => gadget[key] !== payload[key]);
    if (otherFieldsChanged) {
      gadget.addLogEntry('Asset details updated.', 'update', null, getOperatorName());
    }
  }

  /**
   * True when the signed-in session may confirm or cancel this gadget's
   * pending transfer: either their User Group is bound to the
   * destination warehouse (see core/WarehouseScope.js's
   * isWarehouseAllowed — an unrestricted group passes this too, same as
   * everywhere else that check is used), or their group has been
   * explicitly granted manage.confirm-transfers oversight regardless of
   * warehouse scope. Deliberately an OR — the whole point of warehouse
   * scoping is that people already scoped to a site can act on their own
   * inbox without needing a separate permission grant; the permission
   * exists for oversight/backup on top of that, not as a second gate.
   */
  _canActOnPendingTransfer(gadget) {
    if (!gadget.pendingTransfer) return false;
    if (isWarehouseAllowed(gadget.pendingTransfer.toWarehouseId)) return true;
    return can('manage.confirm-transfers');
  }

  /** Applies a pending transfer: writes merchant/positionType/warehouse/owner from the
   * stashed request and clears it. See models/Gadget.js's pendingTransfer for the shape. */
  confirmTransfer(id) {
    const gadget = this.store.get(id);
    if (!gadget || !gadget.pendingTransfer) return;
    if (!this._canActOnPendingTransfer(gadget)) {
      Toast.error('Only someone with access to the destination warehouse (or Confirm transfers access) can confirm this.');
      return;
    }
    const p = gadget.pendingTransfer;
    gadget.addLogEntry(
      `Transfer confirmed: merchant '${gadget.merchant || 'None'}' → '${p.toMerchant}'. Resolved to ${p.toPositionType || 'Unassigned'} · ${p.toWarehouse || '—'} · ${p.toOwner || '—'}.`,
      'transfer',
      { from: gadget.merchant || '', to: p.toMerchant },
      getOperatorName()
    );
    this.store.update(gadget.id, {
      merchant: p.toMerchant,
      positionType: p.toPositionType,
      warehouse: p.toWarehouse,
      owner: p.toOwner,
      pendingTransfer: null
    });
    Toast.success(`Transfer to '${p.toMerchant}' confirmed.`);
  }

  /** Withdraws a pending transfer without applying it — merchant/positionType/warehouse/
   * owner are untouched, exactly as if the request had never been made. Open to the same
   * people who can confirm, plus manage.edit.merchant holders (the same permission that
   * could have requested it in the first place, so they can also take it back). */
  cancelPendingTransfer(id) {
    const gadget = this.store.get(id);
    if (!gadget || !gadget.pendingTransfer) return;
    if (!this._canActOnPendingTransfer(gadget) && !can('manage.edit.merchant')) {
      Toast.error('You do not have permission to cancel this transfer.');
      return;
    }
    const p = gadget.pendingTransfer;
    gadget.addLogEntry(`Transfer to '${p.toMerchant}' cancelled before confirmation.`, 'transfer', { from: p.toMerchant, to: gadget.merchant || '' }, getOperatorName());
    this.store.update(gadget.id, { pendingTransfer: null });
    Toast.show(`Pending transfer to '${p.toMerchant}' cancelled.`);
  }

  /** Row-action entry point for Confirm: asks first, since this is the one click that
   * actually moves the asset (changes merchant/warehouse/owner), same weight as Delete. */
  async _confirmTransferWithPrompt(id) {
    const gadget = this.store.get(id);
    if (!gadget?.pendingTransfer) return;
    const p = gadget.pendingTransfer;
    const ok = await confirmDialog({
      title: 'Confirm receipt',
      message: `Confirm this asset has arrived at '${p.toMerchant}' (${p.toPositionType || 'Unassigned'} · ${p.toWarehouse || '—'} · ${p.toOwner || '—'})? This will finalize the transfer.`,
      confirmLabel: 'Confirm receipt'
    });
    if (ok) this.confirmTransfer(id);
  }

  /** Row-action entry point for Cancel — a lighter prompt than Confirm's, since cancelling
   * is reversible (the merchant can just be transferred again) where confirming isn't. */
  async _cancelTransferWithPrompt(id) {
    const gadget = this.store.get(id);
    if (!gadget?.pendingTransfer) return;
    const p = gadget.pendingTransfer;
    const ok = await confirmDialog({
      title: 'Cancel pending transfer',
      message: `Cancel the pending transfer to '${p.toMerchant}'? The asset will stay at its current merchant.`,
      confirmLabel: 'Cancel transfer',
      danger: true
    });
    if (ok) this.cancelPendingTransfer(id);
  }

  openTransferModal(id) {
    const gadget = this.store.get(id);
    if (!gadget) return;
    const form = buildTransferForm(gadget, this._knownWarehouses());

    const modal = new Modal({
      title: 'Transfer warehouse',
      body: form.node,
      footer: [
        { label: 'Cancel', variant: 'btn-outline', onClick: (m) => m.close() },
        {
          label: 'Transfer',
          variant: 'btn-accent',
          onClick: (m) => {
            const raw = form.getData();
            if (!raw.toWarehouse) {
              form.showErrors({ toWarehouse: 'Destination warehouse is required.' });
              return;
            }
            if (raw.toWarehouse === gadget.warehouse) {
              form.showErrors({ toWarehouse: 'Already in this warehouse.' });
              return;
            }
            const from = gadget.warehouse || '';
            const note = raw.note ? ` Note: ${raw.note}` : '';
            gadget.addLogEntry(`Transferred warehouse from '${from}' to '${raw.toWarehouse}'.${note}`, 'transfer', null, getOperatorName());
            this.store.update(gadget.id, { warehouse: raw.toWarehouse });
            Toast.success(`Transferred to ${raw.toWarehouse}.`);
            m.close();
          }
        }
      ]
    });
    modal.open();
    form.focusFirst();
  }

  /**
   * Opens the Manifest / Transmittal preview for the currently checked
   * rows, in the same order they appear in the (filtered/sorted) table
   * rather than Set insertion order.
   */
  openManifestModal() {
    if (!can('manage.preview-manifest')) return;
    if (this.selected.size === 0) return;
    const gadgets = this._filteredSortedGadgets().filter((g) => this.selected.has(g.id));
    showManifestModal({ gadgets, store: this.store, locationStore: this.locationStore, warehouseStore: this.warehouseStore });
  }

  /**
   * "Adjust Position" only makes sense with a selection (it acts on the
   * checked rows), so it opens a menu rather than a single action —
   * matching the two things you'd actually want to do with a batch of
   * assets: park them somewhere temporary, or move them to a different
   * warehouse outright.
   */
  _openAdjustPositionMenu() {
    if (!can('manage.adjust-position')) return;
    if (this.selected.size === 0) return;
    openDropdownMenu({
      anchor: this.refs.transferItemBtn,
      items: [
        { label: 'Transfer to temporary bin', onClick: () => this.openTemporaryBinModal() },
        { label: 'Transfer warehouse', onClick: () => this.openBulkWarehouseTransferModal() }
      ]
    });
  }

  /**
   * Bulk-moves the selected assets into a temporary holding position
   * (returns processing, defective/damage staging, etc.) — separate from
   * their normal `warehouse`. Every row needs its own position type
   * picked before Confirm enables, since "move everything to the same
   * bin" isn't generally what a mixed batch actually needs.
   *
   * Description is a secondary, optional override per row: the input
   * starts blank (showing the current description as a placeholder hint
   * rather than a value), so a blank field on Confirm leaves that
   * asset's description untouched — only a non-blank entry replaces it.
   */
  openTemporaryBinModal() {
    if (this.selected.size === 0) return;
    const gadgets = this._filteredSortedGadgets().filter((g) => this.selected.has(g.id));

    const node = el(`
      <div class="tempbin-modal">
        <p class="hint">Move the selected assets into a temporary holding position. Choose a position type for every row, then Confirm. Description is optional — leave it blank to keep each asset's current description, or type a new one to override it.</p>
        <div class="grid-scroll">
          <table>
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Serial Number</th>
                <th>Asset Tag (Default)</th>
                <th>Move to temporary bin</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `);

    const tbody = node.querySelector('tbody');
    tbody.innerHTML = gadgets.map((g) => `
      <tr data-id="${g.id}">
        <td data-label="Merchant"><div>${g.merchant ? esc(g.merchant) : '—'}</div></td>
        <td data-label="Serial Number"><div>${g.serialNumber ? esc(g.serialNumber) : '—'}</div></td>
        <td data-label="Asset Tag (Default)"><div>${g.assetTagDefault ? esc(g.assetTagDefault) : '—'}</div></td>
        <td data-label="Move to temporary bin">
          <select data-field="positionType" required>
            <option value="" disabled hidden selected>Position Type</option>
            ${TEMP_POSITION_TYPES.map((t) => `<option value="${t.value}">${esc(t.label)}</option>`).join('')}
          </select>
        </td>
        <td data-label="Description">
          <div><input type="text" data-field="description" value="" placeholder="${g.description ? esc(g.description) : 'Leave blank to keep unchanged'}"></div>
        </td>
      </tr>
    `).join('');

    let confirmBtn = null;
    const isReady = () => [...tbody.querySelectorAll('select[data-field="positionType"]')].every((s) => s.value !== '');
    const updateConfirmState = () => {
      if (!confirmBtn) return;
      const ready = isReady();
      confirmBtn.disabled = !ready;
      confirmBtn.title = ready ? '' : 'Choose a position type for every row first.';
    };
    tbody.querySelectorAll('select[data-field="positionType"]').forEach((s) => {
      enhanceSelect(s);
      s.addEventListener('change', updateConfirmState);
    });

    const modal = new Modal({
      title: 'Move to temporary bin',
      body: node,
      size: 'lg',
      footer: [
        { label: 'Cancel', variant: 'btn-outline', onClick: (m) => m.close() },
        {
          label: 'Confirm',
          variant: 'btn-accent',
          onClick: (m) => {
            if (!isReady()) return; // belt-and-suspenders — the button is disabled anyway
            let count = 0;
            tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
              const gadget = this.store.get(tr.getAttribute('data-id'));
              if (!gadget) return;
              const value = tr.querySelector('select[data-field="positionType"]').value;
              const descriptionOverride = tr.querySelector('input[data-field="description"]').value.trim();

              const patch = {};
              let changed = false;

              if (gadget.temporaryPosition !== value) {
                const fromLabel = temporaryPositionLabel(gadget.temporaryPosition);
                const toLabel = temporaryPositionLabel(value);
                gadget.addLogEntry(
                  `Transferred position from '${fromLabel}' to '${toLabel}'.`,
                  'transfer',
                  { from: gadget.temporaryPosition, to: value },
                  getOperatorName()
                );
                patch.temporaryPosition = value;
                changed = true;
              }

              // Blank means "leave the description as-is" — only a
              // non-blank override actually replaces it.
              if (descriptionOverride && descriptionOverride !== gadget.description) {
                gadget.addLogEntry(`Description updated: "${descriptionOverride}"`, 'update', null, getOperatorName());
                patch.description = descriptionOverride;
                changed = true;
              }

              if (changed) {
                this.store.update(gadget.id, patch);
                count++;
              }
            });
            if (count > 0) Toast.success(`Updated ${count} asset${count === 1 ? '' : 's'}.`);
            m.close();
          }
        }
      ]
    });

    confirmBtn = modal.footEl.querySelector('.btn-accent');
    updateConfirmState();
    modal.open();
  }

  /**
   * Bulk version of the single-asset "Transfer warehouse" action (see
   * openTransferModal): one destination applies to every selected asset,
   * each getting its own history entry so per-asset provenance still
   * reads correctly afterward.
   */
  openBulkWarehouseTransferModal() {
    if (this.selected.size === 0) return;
    const gadgets = this._filteredSortedGadgets().filter((g) => this.selected.has(g.id));
    const warehouses = this._knownWarehouses();

    const node = el(`
      <div class="bulk-transfer-form">
        <p class="hint">Transfer ${gadgets.length} selected asset${gadgets.length === 1 ? '' : 's'} to a new warehouse.</p>
        <div class="field">
          <label for="bulkToWarehouse">Transfer to warehouse</label>
          <input type="text" id="bulkToWarehouse" list="bulkTransferWarehouseOptions" placeholder="e.g. North Annex Warehouse">
          <datalist id="bulkTransferWarehouseOptions">${warehouses.map((w) => `<option value="${esc(w)}">`).join('')}</datalist>
          <div class="field-error" data-error-for="toWarehouse"></div>
        </div>
        <div class="field">
          <label for="bulkTransferNote">Note (optional)</label>
          <input type="text" id="bulkTransferNote" placeholder="Reason for transfer">
        </div>
      </div>
    `);

    const modal = new Modal({
      title: 'Transfer warehouse',
      body: node,
      footer: [
        { label: 'Cancel', variant: 'btn-outline', onClick: (m) => m.close() },
        {
          label: 'Transfer',
          variant: 'btn-accent',
          onClick: (m) => {
            const toWarehouse = node.querySelector('#bulkToWarehouse').value.trim();
            const errorEl = node.querySelector('[data-error-for="toWarehouse"]');
            if (!toWarehouse) {
              errorEl.textContent = 'Destination warehouse is required.';
              return;
            }
            errorEl.textContent = '';

            const note = node.querySelector('#bulkTransferNote').value.trim();
            const noteSuffix = note ? ` Note: ${note}` : '';
            let count = 0;
            gadgets.forEach((gadget) => {
              if (gadget.warehouse === toWarehouse) return; // already there, skip
              const from = gadget.warehouse || '';
              gadget.addLogEntry(`Transferred warehouse from '${from}' to '${toWarehouse}'.${noteSuffix}`, 'transfer', null, getOperatorName());
              this.store.update(gadget.id, { warehouse: toWarehouse });
              count++;
            });
            if (count > 0) Toast.success(`Transferred ${count} asset${count === 1 ? '' : 's'} to ${toWarehouse}.`);
            m.close();
          }
        }
      ]
    });
    modal.open();
    node.querySelector('#bulkToWarehouse')?.focus();
  }

  viewLog(id) {
    if (!can('manage.view-log')) return;
    const gadget = this.store.get(id);
    if (!gadget) return;
    openLogModal({
      title: `History — ${gadget.serialNumber || gadget.assetTagDefault || 'Unassigned asset'}`,
      entries: gadget.history
    });
  }

  async deleteGadget(id) {
    if (!can('manage.delete')) return;
    const gadget = this.store.get(id);
    if (!gadget) return;
    const ok = await confirmDialog({
      title: 'Remove asset',
      message: `Remove the asset assigned to "${gadget.user || 'Unassigned'}" from inventory? This cannot be undone.`,
      confirmLabel: 'Remove',
      danger: true
    });
    if (!ok) return;
    this.store.delete(id);
    this.selected.delete(id);
    Toast.show(`Removed asset for ${gadget.user || 'Unassigned'}.`);
  }

  async clearAll() {
    if (!can('manage.clear-all')) return;
    if (this.store.list().length === 0) {
      Toast.show('There is nothing to clear.');
      return;
    }
    const ok = await confirmDialog({
      title: 'Clear all data',
      message: 'Delete all asset data from this browser? This cannot be undone.',
      confirmLabel: 'Clear all',
      danger: true
    });
    if (!ok) return;
    this.store.clear();
    this.selected.clear();
    Toast.show('All asset data cleared.');
  }

  /** Plain export when nothing's selected (only one sensible option); a dropdown to choose between all/selected once something is. */
  _openExportMenu() {
    if (this.selected.size === 0) {
      this.exportCsv();
      return;
    }
    openDropdownMenu({
      anchor: this.refs.exportBtn,
      items: [
        { label: 'Export all', onClick: () => this.exportCsv() },
        { label: `Export selected (${this.selected.size})`, onClick: () => this.exportCsv({ selectedOnly: true }) }
      ]
    });
  }

  exportCsv({ selectedOnly = false } = {}) {
    const filtered = this._filteredSortedGadgets();
    const gadgets = selectedOnly ? filtered.filter((g) => this.selected.has(g.id)) : filtered;
    if (gadgets.length === 0) {
      Toast.show(selectedOnly ? 'No selected assets to export.' : 'There is nothing to export.');
      return;
    }
    // Password is intentionally excluded from CSV export to avoid writing
    // plaintext credentials to disk.
    const headers = ['User', 'Role', 'Category', 'Serial Number', 'Warehouse Asset Tag', 'Asset Tag (Default)', 'MAC Address', 'Merchant', 'Owner', 'Remarks', 'Description', 'Warehouse', 'Created', 'Last Updated'];
    const rows = gadgets.map((g) => [
      g.user, g.role, g.category, g.serialNumber, g.warehouseAssetTag, g.assetTagDefault,
      g.macAddress, g.merchant, g.owner, g.remarks, g.description, g.warehouse, fmtLocalDateTime(g.createdAt), fmtLocalDateTime(g.updatedAt)
    ].map((v) => {
      let s = String(v == null ? '' : v);
      if (s.includes(',') || s.includes('"')) s = `"${s.replace(/"/g, '""')}"`;
      return s;
    }).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stockroom-assets${selectedOnly ? '-selected' : ''}-${fmtLocalDateStamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Toast.success(`Exported ${gadgets.length} ${selectedOnly ? 'selected ' : ''}asset${gadgets.length === 1 ? '' : 's'} to CSV.`);
  }

  // ---------- Import (opened from the "Add asset" options menu) ----------
  /** Opens a modal that bundles both halves of the CSV import flow: the
   * export-template download (so the user knows the expected columns) and
   * the file picker that triggers the actual import. */
  openImportModal() {
    if (!can('manage.import')) return;
    const progress = buildImportProgress();
    const body = el(`
      <div class="import-modal-body">
        <p class="hint" style="margin-bottom:14px;">Import assets from a CSV file. Download the template to see the exact column format expected, fill it in, then choose your file below.</p>
        <button tabindex="-1" type="button" class="btn btn-outline" id="mImportExportTemplateBtn" style="margin-bottom:14px;">Export template</button>
        <div class="import-dropzone">
          <button tabindex="-1" type="button" class="btn btn-accent btn-sm" id="mImportChooseFileBtn">Choose CSV file…</button>
          <span class="import-file-name">CSV files exported by this app's template are matched by column name.</span>
        </div>
      </div>
    `);
    body.appendChild(progress.node);

    const modal = new Modal({
      title: 'Import assets',
      body,
      footer: [
        { label: 'Close', variant: 'btn-outline', onClick: (m) => m.close() }
      ]
    });

    body.querySelector('#mImportExportTemplateBtn').addEventListener('click', () => this.exportTemplate());
    body.querySelector('#mImportChooseFileBtn').addEventListener('click', () => {
      this._pendingImportModal = modal;
      this._pendingImportProgress = progress;
      this.refs.importFileInput.click();
    });

    modal.open();
  }

  /** Downloads a blank CSV with the exact headers the importer expects. */
  exportTemplate() {
    const exampleRow = ['Maria Santos', 'Warehouse Associate', 'Laptop', 'SN-EXAMPLE-0001', 'WH-EXAMPLE', 'DELL-EXAMPLE', 'AA:BB:CC:DD:EE:FF', 'Merchant', 'Sample Owner', '', ''];
    const csv = toCsv(IMPORT_HEADERS, [exampleRow]);
    downloadCsv(csv, 'stockroom-assets-template.csv');
    Toast.show('Template downloaded. Replace the example row with your data, then use Import.');
  }

  _handleImportFile(event) {
    if (!can('manage.import')) return;
    const file = event.target.files?.[0];
    // Clear the input immediately so choosing the same filename again
    // still fires a change event next time.
    event.target.value = '';
    const modal = this._pendingImportModal;
    const progress = this._pendingImportProgress;
    this._pendingImportModal = null;
    this._pendingImportProgress = null;
    if (!file) return;

    readCsvFile(file)
      .then(async (text) => {
        const chooseBtn = modal?.bodyEl?.querySelector('#mImportChooseFileBtn');
        const templateBtn = modal?.bodyEl?.querySelector('#mImportExportTemplateBtn');
        if (chooseBtn) chooseBtn.disabled = true;
        if (templateBtn) templateBtn.disabled = true;
        progress?.start();

        await this._importCsvText(text, progress);

        progress?.finish('Import complete.');
        // Brief pause so "Import complete" is actually readable instead of
        // flashing past on its way to the modal closing.
        setTimeout(() => modal?.close(), 600);
      })
      .catch(() => Toast.error('Could not read that file.'));
  }

  /**
   * Parses CSV text (matching IMPORT_HEADERS, matched by name so column
   * order in the uploaded file doesn't have to match the template
   * exactly) and creates one Gadget per row. Rows whose serial number
   * collides with an existing record or an earlier row in the same file
   * are skipped and counted rather than aborting the whole import.
   *
   * Runs in small chunks (see utils/asyncBatch.js) rather than one tight
   * forEach — a large file would otherwise block the tab for however
   * long the whole loop takes, and `progress` would only ever jump
   * straight to 100% once the browser got a chance to repaint at all.
   */
  async _importCsvText(text, progress = null) {
    const rows = parseCsv(text);
    if (rows.length === 0) {
      Toast.error('That file has no rows to import.');
      return;
    }

    const header = rows.shift().map((h) => h.trim().toLowerCase());
    const colIndex = {
      user: header.indexOf('user'),
      role: header.indexOf('role'),
      category: header.indexOf('category'),
      serialNumber: header.indexOf('serial number'),
      warehouseAssetTag: header.indexOf('warehouse asset tag'),
      assetTagDefault: header.indexOf('asset tag (default)'),
      macAddress: header.indexOf('mac address'),
      merchant: header.indexOf('merchant'),
      owner: header.indexOf('owner'),
      remarks: header.indexOf('remarks'),
      description: header.indexOf('description')
    };
    if (colIndex.category === -1) {
      Toast.error('Import file is missing a "Category" column — use Export Template to see the expected format.');
      return;
    }

    const pick = (cells, key) => (colIndex[key] !== -1 ? (cells[colIndex[key]] || '').trim() : '');

    const seenSerials = new Set(
      this.store.list().map((g) => (g.serialNumber || '').trim().toLowerCase()).filter(Boolean)
    );

    let created = 0;
    let skippedDuplicateSerial = 0;
    let skippedInvalidCatalog = 0;

    await processInChunks(rows, (cells) => {
      if (cells.every((c) => c.trim() === '')) return; // blank line

      const serialNumber = pick(cells, 'serialNumber');
      const serialKey = serialNumber.toLowerCase();
      if (serialKey && seenSerials.has(serialKey)) {
        skippedDuplicateSerial++;
        return;
      }

      const category = pick(cells, 'category') || 'Uncategorized';
      const assetTagDefault = pick(cells, 'assetTagDefault');
      const macAddress = pick(cells, 'macAddress');
      if (this._hasCatalogIssue({ category, serialNumber, assetTagDefault, macAddress })) {
        skippedInvalidCatalog++;
        return;
      }

      if (serialKey) seenSerials.add(serialKey);

      // Guaranteed to exist — _hasCatalogIssue above already confirmed
      // this exact serial number matches a catalog row, so this is just
      // grabbing that same row's id to persist as the real foreign key
      // (see models/Gadget.js's inventoryAssetId), not a second lookup
      // that could plausibly come back empty.
      const matchedAsset = this.inventoryAssetStore?.list().find((a) => (a.serialNumber || '').trim() === serialNumber);

      // Merchant is the key: if it matches a created warehouse location,
      // Position Type / Warehouse / Owner are derived from that location
      // rather than trusted from the file. An imported Owner column is
      // kept only as a manual fallback when the merchant doesn't resolve
      // to anything (e.g. the location hasn't been created yet).
      const merchant = pick(cells, 'merchant');
      const placement = this._resolvePlacement(merchant);

      const gadget = new Gadget({
        user: pick(cells, 'user'),
        role: pick(cells, 'role'),
        category,
        serialNumber,
        warehouseAssetTag: pick(cells, 'warehouseAssetTag'),
        assetTagDefault,
        macAddress: pick(cells, 'macAddress'),
        merchant,
        owner: placement.matched ? placement.owner : pick(cells, 'owner'),
        positionType: placement.matched ? placement.positionType : '',
        warehouse: placement.matched ? placement.warehouse : '',
        remarks: pick(cells, 'remarks'),
        description: pick(cells, 'description'),
        inventoryAssetId: matchedAsset ? matchedAsset.id : null
      });
      gadget.addLogEntry('Asset added via CSV import.', 'create', null, getOperatorName());
      this.store.create(gadget);
      created++;
    }, {
      chunkSize: 25,
      onProgress: (done, total) => progress?.update(done, total)
    });

    if (created > 0) {
      Toast.success(`Imported ${created} ${created === 1 ? 'asset' : 'assets'}.`);
    }
    if (skippedDuplicateSerial > 0) {
      Toast.error(`Skipped ${skippedDuplicateSerial} duplicate serial number${skippedDuplicateSerial === 1 ? '' : 's'}.`);
    }
    if (skippedInvalidCatalog > 0) {
      Toast.error(`Skipped ${skippedInvalidCatalog} row${skippedInvalidCatalog === 1 ? '' : 's'} not matching Inventory Assets.`);
    }
    if (created === 0 && skippedDuplicateSerial === 0 && skippedInvalidCatalog === 0) {
      Toast.show('Nothing to import — the file had no data rows.');
    }
  }
}