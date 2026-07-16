import { Store } from './core/Store.js';
import { TabManager } from './core/TabManager.js';
import { Gadget } from './models/Gadget.js';
import { ManageView } from './features/manage/ManageView.js';
import { ManageController } from './features/manage/ManageController.js';
import { InventoryAsset } from './models/InventoryAsset.js';
import { InventoryAssetView } from './features/inventoryAssets/InventoryAssetView.js';
import { InventoryAssetController } from './features/inventoryAssets/InventoryAssetController.js';
import { getOperatorName, setOperatorName } from './core/Operator.js';
import { Toast } from './components/Toast.js';
import { Warehouse } from './models/Warehouse.js';
import { WarehouseLocation } from './models/WarehouseLocation.js';
import { SettingsController } from './features/settings/SettingsController.js';

function seedGadgets() {
  const now = Date.now();
  return [
    { user: 'Maria Santos', role: 'Warehouse Associate', category: 'Laptop', serialNumber: 'SN-88213X', warehouseAssetTag: 'WH-0091', assetTagDefault: 'DELL-77213', macAddress: '3C:22:FB:AA:11:02', password: 'Wh0091!secure', merchant: 'INSPI Group', remarks: 'Assigned on onboarding', description: 'Dell Latitude 5420, 16GB RAM, good condition', positionType: 'Good Position', warehouse: 'Main Warehouse', owner: 'Sample Owner', updatedAt: now },
    { user: 'Jun Dela Cruz', role: 'Forklift Operator', category: 'Handheld Scanner', serialNumber: 'SN-44120Q', warehouseAssetTag: 'WH-0114', assetTagDefault: 'ZEBRA-9931', macAddress: '', password: '', merchant: 'OCZISE', remarks: '', description: 'Zebra TC21 barcode scanner', positionType: 'Good Position', warehouse: 'Main Warehouse', owner: 'Test Owner', updatedAt: now },
    { user: '', role: '', category: 'Router', serialNumber: 'SN-77002A', warehouseAssetTag: 'WH-0203', assetTagDefault: 'TPLINK-4410', macAddress: 'A0:B1:C2:D3:E4:F5', password: 'RtrAdm!n88', merchant: 'Kleenfant', remarks: 'Spare, not yet assigned', description: 'TP-Link AX3000, factory reset', positionType: 'Temporary Damage', warehouse: 'North Annex Warehouse', owner: 'No Owner', updatedAt: now },
    { user: 'Liza Bautista', role: 'Inventory Clerk', category: 'Tablet', serialNumber: 'SN-19087K', warehouseAssetTag: 'WH-0132', assetTagDefault: 'IPAD-2201', macAddress: '', password: '4821', merchant: 'PetMate Corp', remarks: '', description: 'iPad 9th gen with rugged case', positionType: 'Temporary Position', warehouse: 'North Annex Warehouse', owner: '', updatedAt: now },
    { user: 'Rico Fernandez', role: 'Site Supervisor', category: 'Laptop', serialNumber: 'SN-33501P', warehouseAssetTag: 'WH-0077', assetTagDefault: 'HP-5591', macAddress: '5C:F9:38:AA:2B:10', password: 'SiteS3cure!', merchant: 'Shigetsu', remarks: 'Requested faster charger', description: 'HP EliteBook 840, 32GB RAM', positionType: 'Temporary Returned', warehouse: 'Main Warehouse', owner: '', updatedAt: now },
    { user: '', role: '', category: 'Handheld Scanner', serialNumber: 'SN-90211M', warehouseAssetTag: '', assetTagDefault: 'ZEBRA-9902', macAddress: '', password: '', merchant: '', remarks: 'Awaiting warehouse assignment', description: 'Zebra TC21, brand new, unboxed', positionType: 'Inventory Position', warehouse: '', owner: '', updatedAt: now }
  ];
}

/**
 * Seed data for the Inventory Assets module — the master list of raw
 * stock (no user/warehouse assignment yet), distinct from the seeded
 * Gadgets above which represent already-assigned equipment.
 */
function seedInventoryAssets() {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  return [
    { category: 'Laptop', serialNumber: 'SN-71120A', assetTag: 'WH-0201', macAddress: '9C:35:5B:11:2A:04', imei1: '8546734562', imei2: '864325623', createdAt: now - 30 * day },
    { category: 'Handheld Scanner', serialNumber: 'SN-90211M', assetTag: 'ZEBRA-9902', macAddress: '', imei1: '85683453423', imei2: '', createdAt: now - 22 * day },
    { category: 'Router', serialNumber: 'SN-77002A', assetTag: 'TPLINK-4410', macAddress: 'A0:B1:C2:D3:E4:F5', imei1: '', imei2: '8658456343', createdAt: now - 14 * day },
    { category: 'Tablet', serialNumber: 'SN-19087K', assetTag: 'IPAD-2201', macAddress: '', imei1: '', imei2: '', createdAt: now - 5 * day }
  ];
}

/** Seed data for Settings → Warehouse Information, so the tree isn't empty on first load. */
function seedWarehouses() {
  const now = Date.now();
  return [
    {
      name: 'Main Warehouse', operationMode: 'self-operate',
      shortName: 'main', currency: 'PHP', country: 'Philippines', region: 'Cagayan Valley',
      city: 'Luna', fullAddress: 'Purok 3, Poblacion, Luna, Cagayan Valley',
      contactPerson: 'Maria Santos', phoneNumber: '09171234567', email: '', zipCode: '3521',
      createdAt: now, updatedAt: now
    }
  ];
}

function collectRefs() {
  return {
    // Filter bar
    filterKeyword: document.getElementById('filterKeyword'),
    filterCategory: document.getElementById('filterCategory'),
    filterWarehouse: document.getElementById('filterWarehouse'),
    warehouseTabs: document.getElementById('warehouseTabs'),
    filterSerial: document.getElementById('filterSerial'),
    filterMac: document.getElementById('filterMac'),
    searchBtn: document.getElementById('searchBtn'),
    resetBtn: document.getElementById('resetBtn'),

    // Action bar
    addItemBtn: document.getElementById('addItemBtn'),
    importFileInput: document.getElementById('importFileInput'),
    exportBtn: document.getElementById('exportBtn'),
    manifestBtn: document.getElementById('manifestBtn'),
    manifestSep: document.getElementById('manifestSep'),
    transferItemBtn: document.getElementById('transferItemBtn'),
    transferItemSep: document.getElementById('transferItemSep'),
    bulkDeleteBtn: document.getElementById('bulkDeleteBtn'),
    bulkDeleteSep: document.getElementById('bulkDeleteSep'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    emptyAddBtn: document.getElementById('emptyAddBtn'),

    // Table
    tableHead: document.getElementById('tableHead'),
    tableBody: document.getElementById('tableBody'),
    emptyState: document.getElementById('emptyState'),
    selectAllCheckbox: document.getElementById('selectAllCheckbox'),

    // Footer / pagination
    selectedCount: document.getElementById('selectedCount'),
    resultCount: document.getElementById('resultCount'),
    pageSizeSelect: document.getElementById('pageSizeSelect'),
    prevPageBtn: document.getElementById('prevPageBtn'),
    nextPageBtn: document.getElementById('nextPageBtn'),
    pageNumbers: document.getElementById('pageNumbers'),
    gotoPageInput: document.getElementById('gotoPageInput'),
    gotoPageBtn: document.getElementById('gotoPageBtn')
  };
}

/** Refs scoped to the Inventory Assets panel — kept separate from collectRefs()
 * above (the Manage/Gadgets panel) so the two features never accidentally
 * share or clash over element ids. */
function collectInventoryAssetRefs() {
  return {
    // Filter bar
    filterKeyword: document.getElementById('iaFilterKeyword'),
    filterCategory: document.getElementById('iaFilterCategory'),
    searchBtn: document.getElementById('iaSearchBtn'),
    resetBtn: document.getElementById('iaResetBtn'),

    // Action bar
    addItemBtn: document.getElementById('iaAddItemBtn'),
    importFileInput: document.getElementById('iaImportFileInput'),
    exportBtn: document.getElementById('iaExportBtn'),
    bulkDeleteBtn: document.getElementById('iaBulkDeleteBtn'),
    bulkDeleteSep: document.getElementById('iaBulkDeleteSep'),
    clearAllBtn: document.getElementById('iaClearAllBtn'),
    refreshBtn: document.getElementById('iaRefreshBtn'),
    emptyAddBtn: document.getElementById('iaEmptyAddBtn'),

    // Table
    tableHead: document.getElementById('iaTableHead'),
    tableBody: document.getElementById('iaTableBody'),
    emptyState: document.getElementById('iaEmptyState'),
    selectAllCheckbox: document.getElementById('iaSelectAllCheckbox'),

    // Footer / pagination
    selectedCount: document.getElementById('iaSelectedCount'),
    resultCount: document.getElementById('iaResultCount'),
    pageSizeSelect: document.getElementById('iaPageSizeSelect'),
    prevPageBtn: document.getElementById('iaPrevPageBtn'),
    nextPageBtn: document.getElementById('iaNextPageBtn'),
    pageNumbers: document.getElementById('iaPageNumbers'),
    gotoPageInput: document.getElementById('iaGotoPageInput'),
    gotoPageBtn: document.getElementById('iaGotoPageBtn')
  };
}

/** Refs for the Settings tab's nav + Warehouse Information sub-view. */
function collectSettingsRefs() {
  return {
    settingsNav: document.getElementById('settingsNav'),
    whAddBtn: document.getElementById('whAddBtn'),
    whImportBtn: document.getElementById('whImportBtn'),
    whImportFileInput: document.getElementById('whImportFileInput'),
    warehouseTree: document.getElementById('warehouseTree'),
    warehouseDetailPanel: document.getElementById('warehouseDetailPanel')
  };
}

function bindAdvancedFilterToggle() {
  const toggle = document.getElementById('filterAdvancedToggle');
  const row = document.getElementById('filterAdvancedRow');
  if (!toggle || !row) return;

  toggle.addEventListener('click', () => {
    const willShow = row.hidden;
    row.hidden = !willShow;
    toggle.setAttribute('aria-expanded', String(willShow));
    toggle.innerHTML = willShow
      ? 'Hide <span class="chev">▲</span>'
      : 'Show <span class="chev">▾</span>';
  });
}

function initTabs() {
  const tabs = new TabManager({
    tabstripEl: document.getElementById('tabstrip'),
    panelsEl: document.getElementById('panels'),
    tabs: [
      { id: 'home', title: 'Home Page', pinned: true, closable: false },
      { id: 'assets', title: 'Manage', closable: true },
      { id: 'inventory-assets', title: 'Inventory Assets', closable: true },
      { id: 'reports', title: 'Reports', closable: true },
      { id: 'settings', title: 'Settings', closable: true }
    ]
  });

  document.querySelectorAll('.rail-icon[data-open-tab]').forEach((btn) => {
    btn.addEventListener('click', () => tabs.open(btn.getAttribute('data-open-tab')));
  });

  tabs.open('home');
}

/** Wires the Settings tab's one field: the operator name used to stamp
 * new history entries and pre-fill manifests (see core/Operator.js). */
function bindSettingsPanel() {
  const form = document.getElementById('operatorForm');
  const input = document.getElementById('operatorNameInput');
  if (!form || !input) return;

  input.value = getOperatorName();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    setOperatorName(input.value);
    input.value = getOperatorName();
    Toast.success('Saved. New activity will be recorded under this name.');
  });
}

function main() {
  const store = new Store({
    key: 'stockroom_gadgets_v1',
    seed: seedGadgets,
    factory: (raw) => new Gadget(raw)
  });

  const inventoryAssetStore = new Store({
    key: 'stockroom_inventory_assets_v1',
    seed: seedInventoryAssets,
    factory: (raw) => new InventoryAsset(raw)
  });

  const warehouseStore = new Store({
    key: 'stockroom_warehouses_v1',
    seed: seedWarehouses,
    factory: (raw) => new Warehouse(raw)
  });

  const warehouseLocationStore = new Store({
    key: 'stockroom_warehouse_locations_v1',
    seed: () => [],
    factory: (raw) => new WarehouseLocation(raw)
  });

  const refs = collectRefs();
  const view = new ManageView(refs);
  const controller = new ManageController({ store, view, refs, inventoryAssetStore, warehouseStore });
  controller.init();

  const inventoryAssetRefs = collectInventoryAssetRefs();
  const inventoryAssetView = new InventoryAssetView(inventoryAssetRefs);
  const inventoryAssetController = new InventoryAssetController({
    store: inventoryAssetStore,
    view: inventoryAssetView,
    refs: inventoryAssetRefs
  });
  inventoryAssetController.init();

  const settingsController = new SettingsController({
    warehouseStore,
    locationStore: warehouseLocationStore,
    refs: collectSettingsRefs()
  });
  settingsController.init();

  initTabs();
  bindAdvancedFilterToggle();
  bindSettingsPanel();
}

document.addEventListener('DOMContentLoaded', main);