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
import { ReportsController } from './features/reports/ReportsController.js';
import { ReportsView } from './features/reports/ReportsView.js';
import { UserAccount } from './models/UserAccount.js';
import { UserAccountView } from './features/userManagement/UserAccountView.js';
import { UserAccountController } from './features/userManagement/UserAccountController.js';
import { UserGroup } from './models/UserGroup.js';
import { UserGroupView } from './features/userManagement/UserGroupView.js';
import { UserGroupController } from './features/userManagement/UserGroupController.js';
import { supabase } from './core/supabaseClient.js';

/**
 * Merchant is the key for Position Type / Warehouse / Owner (see
 * utils/merchantPlacement.js): a gadget whose merchant matches a created
 * warehouse location's name gets those three columns *derived* from where
 * that location lives, rather than typed by hand. Maria and Jun below are
 * seeded with merchant 'Samples', which seedWarehouseLocations() creates
 * under Warehouse 1 · Main Warehouse as a Good Position — so their
 * positionType/warehouse/owner here are pre-computed to match exactly
 * what _saveGadget() would derive on save, demonstrating the feature
 * working end to end from first load. Liza's merchant 'Test Location'
 * resolves the same way against Warehouse 1 · Damage Warehouse (Inventory
 * Position). The remaining rows use merchant names with no matching
 * location — a normal, supported state — so their placement stays
 * whatever was set by hand (or blank), same as before this feature.
 */
function seedGadgets() {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  return [
    { user: 'Maria Santos', role: 'Warehouse Associate', category: 'Laptop', serialNumber: 'SN-88213X', warehouseAssetTag: 'WH-0091', assetTagDefault: 'DELL-77213', macAddress: '3C:22:FB:AA:11:02', password: 'Wh0091!secure', merchant: 'Samples', remarks: 'Assigned on onboarding', description: 'Dell Latitude 5420, 16GB RAM, good condition', positionType: 'Good Position', warehouse: 'Main Warehouse', owner: 'Warehouse 1', createdAt: now - 30 * day, updatedAt: now },
    { user: 'Jun Dela Cruz', role: 'Forklift Operator', category: 'Handheld Scanner', serialNumber: 'SN-44120Q', warehouseAssetTag: 'WH-0114', assetTagDefault: 'ZEBRA-9931', macAddress: '', password: '', merchant: 'Samples', remarks: '', description: 'Zebra TC21 barcode scanner', positionType: 'Good Position', warehouse: 'Main Warehouse', owner: 'Warehouse 1', createdAt: now - 30 * day, updatedAt: now },
    { user: '', role: '', category: 'Router', serialNumber: 'SN-77002A', warehouseAssetTag: 'WH-0203', assetTagDefault: 'TPLINK-4410', macAddress: 'A0:B1:C2:D3:E4:F5', password: 'RtrAdm!n88', merchant: 'Kleenfant', remarks: 'Spare, not yet assigned', description: 'TP-Link AX3000, factory reset', positionType: 'Temporary Damage', warehouse: 'Damage Warehouse', owner: 'Warehouse 2', createdAt: now - 30 * day, updatedAt: now },
    { user: 'Liza Bautista', role: 'Inventory Clerk', category: 'Tablet', serialNumber: 'SN-19087K', warehouseAssetTag: 'WH-0132', assetTagDefault: 'IPAD-2201', macAddress: '', password: '4821', merchant: 'Test Location', remarks: '', description: 'iPad 9th gen with rugged case', positionType: 'Inventory Position', warehouse: 'Damage Warehouse', owner: 'Warehouse 3', createdAt: now - 30 * day, updatedAt: now },
    { user: 'Rico Fernandez', role: 'Site Supervisor', category: 'Laptop', serialNumber: 'SN-33501P', warehouseAssetTag: 'WH-0077', assetTagDefault: 'HP-5591', macAddress: '5C:F9:38:AA:2B:10', password: 'SiteS3cure!', merchant: 'Shigetsu', remarks: 'Requested faster charger', description: 'HP EliteBook 840, 32GB RAM', positionType: 'Temporary Returned', warehouse: 'Main Warehouse', owner: '', createdAt: now - 30 * day, updatedAt: now },
    { user: '', role: '', category: 'Handheld Scanner', serialNumber: 'SN-90211M', warehouseAssetTag: '', assetTagDefault: 'ZEBRA-9902', macAddress: '', password: '', merchant: '', remarks: 'Awaiting warehouse assignment', description: 'Zebra TC21, brand new, unboxed', positionType: '', warehouse: '', owner: '', createdAt: now - 30 * day, updatedAt: now }
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

/**
 * Seed data for Settings → User management → User — the login-account
 * list. `lastLoginAt` is left null for a couple of rows to exercise the
 * "—" placeholder (an account that's never signed in yet is normal, not
 * a data error).
 */
function seedUserAccounts() {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  return [
    { userNumber: '10023841', username: 'Maria Santos', loginAccount: 'maria.santos@inspi.com.ph', userGroup: 'Warehouse Associate', mail: 'maria.santos@inspi.com.ph', phoneNumber: '09171234567', enabled: true, createdAt: now - 400 * day, updatedAt: now - 12 * day, lastLoginAt: now - 1 * day },
    { userNumber: '10045210', username: 'Jun Dela Cruz', loginAccount: 'jun.delacruz@inspi.com.ph', userGroup: 'Forklift Operator', mail: 'jun.delacruz@inspi.com.ph', phoneNumber: '09189876543', enabled: true, createdAt: now - 300 * day, updatedAt: now - 40 * day, lastLoginAt: now - 5 * day },
    { userNumber: '10067732', username: 'Liza Bautista', loginAccount: 'liza.bautista@inspi.com.ph', userGroup: 'Inventory Clerk', mail: '', phoneNumber: '', enabled: false, createdAt: now - 200 * day, updatedAt: now - 200 * day, lastLoginAt: null },
    { userNumber: '10088456', username: 'Rico Fernandez', loginAccount: 'rico.fernandez@inspi.com.ph', userGroup: 'Site Supervisor', mail: 'rico.fernandez@inspi.com.ph', phoneNumber: '09201112233', enabled: true, createdAt: now - 90 * day, updatedAt: now - 2 * day, lastLoginAt: now - 2 * day },
    { userNumber: '10091023', username: 'Company Admin', loginAccount: 'admin@inspi.com.ph', userGroup: 'Admin', mail: 'admin@inspi.com.ph', phoneNumber: '09175132562', enabled: true, createdAt: now - 500 * day, updatedAt: now - 1 * day, lastLoginAt: now }
  ];
}

/**
 * Seed data for Settings → Warehouse Information, so the tree isn't empty
 * on first load. `id` is fixed (rather than left to Warehouse's random
 * default) so seedWarehouseLocations() below can reference it directly —
 * the two seed functions run independently, so there's no other way to
 * wire a location to "whichever id this warehouse happened to get".
 */
function seedWarehouses() {
  const now = Date.now();
  return [
    {
      id: 'wh-seed-1',
      name: 'Warehouse 1', operationMode: 'self-operate',
      shortName: 'main', currency: 'PHP', country: 'Philippines', region: 'Cagayan Valley',
      city: 'Luna', fullAddress: 'Purok 3, Poblacion, Luna, Cagayan Valley',
      contactPerson: 'Maria Santos', phoneNumber: '09171234567', email: '', zipCode: '3521',
      createdAt: now, updatedAt: now
    }
  ];
}

/**
 * Seed data for the created warehouse locations that merchant matching
 * resolves against (see utils/merchantPlacement.js) — mirrors this
 * feature's own worked example: Warehouse 1 · Main Warehouse has a
 * "Samples" Good Position, and Warehouse 1 · Damage Warehouse has a
 * "Test Location" Inventory Position.
 */
function seedWarehouseLocations() {
  const now = Date.now();
  return [
    {
      warehouseId: 'wh-seed-1', zone: 'main', area: 'Samples', locationCode: 'Samples',
      positionNumber: '9111820000000', property: 'goods', enabled: true, createdAt: now
    },
    {
      warehouseId: 'wh-seed-1', zone: 'damage', area: 'Test Location', locationCode: 'Test Location',
      positionNumber: '9111690000000', property: 'inventory', enabled: true, createdAt: now
    }
  ];
}

function collectRefs() {
  return {
    // Filter bar
    filterKeyword: document.getElementById('filterKeyword'),
    filterCategory: document.getElementById('filterCategory'),
    warehouseFilterBtn: document.getElementById('warehouseFilterBtn'),
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

/** Refs for Settings → User management → User. */
/** Refs for the User group grid (Settings → User management → User group). */
function collectUserGroupRefs() {
  return {
    // Filter bar
    filterGroupNumber: document.getElementById('ugFilterGroupNumber'),
    filterName: document.getElementById('ugFilterName'),
    enabledFilterMount: document.getElementById('ugEnabledFilterMount'),
    searchBtn: document.getElementById('ugSearchBtn'),
    resetBtn: document.getElementById('ugResetBtn'),

    // Action bar
    addGroupBtn: document.getElementById('ugAddGroupBtn'),
    viewLogBtn: document.getElementById('ugViewLogBtn'),
    emptyAddBtn: document.getElementById('ugEmptyAddBtn'),

    // Table
    tableBody: document.getElementById('ugTableBody'),
    emptyState: document.getElementById('ugEmptyState'),

    // Footer / pagination
    resultCount: document.getElementById('ugResultCount'),
    pageSizeSelect: document.getElementById('ugPageSizeSelect'),
    prevPageBtn: document.getElementById('ugPrevPageBtn'),
    nextPageBtn: document.getElementById('ugNextPageBtn'),
    pageNumbers: document.getElementById('ugPageNumbers'),
    gotoPageInput: document.getElementById('ugGotoPageInput'),
    gotoPageBtn: document.getElementById('ugGotoPageBtn')
  };
}

function collectUserAccountRefs() {
  return {
    // Filter bar
    filterUserNumber: document.getElementById('uaFilterUserNumber'),
    filterUsername: document.getElementById('uaFilterUsername'),
    filterLoginAccount: document.getElementById('uaFilterLoginAccount'),
    enabledFilterMount: document.getElementById('uaEnabledFilterMount'),
    searchBtn: document.getElementById('uaSearchBtn'),
    resetBtn: document.getElementById('uaResetBtn'),

    // Action bar
    addUserBtn: document.getElementById('uaAddUserBtn'),
    viewLogBtn: document.getElementById('uaViewLogBtn'),
    emptyAddBtn: document.getElementById('uaEmptyAddBtn'),

    // Table
    tableBody: document.getElementById('uaTableBody'),
    emptyState: document.getElementById('uaEmptyState'),

    // Footer / pagination
    resultCount: document.getElementById('uaResultCount'),
    pageSizeSelect: document.getElementById('uaPageSizeSelect'),
    prevPageBtn: document.getElementById('uaPrevPageBtn'),
    nextPageBtn: document.getElementById('uaNextPageBtn'),
    pageNumbers: document.getElementById('uaPageNumbers'),
    gotoPageInput: document.getElementById('uaGotoPageInput'),
    gotoPageBtn: document.getElementById('uaGotoPageBtn')
  };
}

/** Refs for the Reports dashboard + activity feed. */
function collectReportsRefs() {
  return {
    reportStats: document.getElementById('reportStats'),
    reportByCategory: document.getElementById('reportByCategory'),
    reportByWarehouse: document.getElementById('reportByWarehouse'),
    reportByPosition: document.getElementById('reportByPosition'),
    reportByAssetCategory: document.getElementById('reportByAssetCategory'),
    reportByLocationType: document.getElementById('reportByLocationType'),
    reportActivityFeed: document.getElementById('reportActivityFeed'),
    warehouseFilterBtn: document.getElementById('reportsWarehouseFilterBtn'),
    exportBtn: document.getElementById('reportsExportBtn')
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
  // Scaffold check only — nothing in the app reads from or writes to
  // Supabase yet. Once js/core/supabaseConfig.js has real credentials,
  // this confirms the client actually initialized before any feature
  // starts depending on it.
  console.log(supabase ? '[supabase] Client ready.' : '[supabase] Not configured — see js/core/supabaseConfig.js.');

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
    seed: seedWarehouseLocations,
    factory: (raw) => new WarehouseLocation(raw)
  });

  const userAccountStore = new Store({
    key: 'stockroom_user_accounts_v1',
    seed: seedUserAccounts,
    factory: (raw) => new UserAccount(raw)
  });

  const userGroupStore = new Store({
    key: 'stockroom_user_groups_v1',
    factory: (raw) => new UserGroup(raw)
  });

  const refs = collectRefs();
  const view = new ManageView(refs);
  const controller = new ManageController({ store, view, refs, inventoryAssetStore, warehouseStore, locationStore: warehouseLocationStore });
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

  const userGroupRefs = collectUserGroupRefs();
  const userGroupView = new UserGroupView(userGroupRefs);
  const userGroupController = new UserGroupController({
    store: userGroupStore,
    userAccountStore,
    view: userGroupView,
    refs: userGroupRefs
  });
  userGroupController.init();

  const userAccountRefs = collectUserAccountRefs();
  const userAccountView = new UserAccountView(userAccountRefs);
  const userAccountController = new UserAccountController({
    store: userAccountStore,
    userGroupStore,
    view: userAccountView,
    refs: userAccountRefs
  });
  userAccountController.init();

  const reportsRefs = collectReportsRefs();
  const reportsView = new ReportsView(reportsRefs);
  const reportsController = new ReportsController({
    store,
    inventoryAssetStore,
    warehouseStore,
    locationStore: warehouseLocationStore,
    view: reportsView,
    refs: reportsRefs
  });
  reportsController.init();

  initTabs();
  bindAdvancedFilterToggle();
  bindSettingsPanel();
}

document.addEventListener('DOMContentLoaded', main);