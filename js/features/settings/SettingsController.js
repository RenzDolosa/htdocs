import { el, esc, qsa } from '../../utils/dom.js';
import { Modal } from '../../components/Modal.js';
import { confirmDialog } from '../../components/ConfirmDialog.js';
import { Toast } from '../../components/Toast.js';
import { Warehouse, WAREHOUSE_TYPES } from '../../models/Warehouse.js';
import { buildWarehouseForm } from './WarehouseForm.js';
import { openWarehouseLocationModal } from './WarehouseLocationModal.js';
import { readCsvFile, parseCsv } from '../../utils/csv.js';

/**
 * Drives Settings → Basic Configuration → Warehouse Information: the left
 * settings rail (expand Basic Configuration, pick Warehouse Information),
 * the warehouse tree, and the right-hand warehouse details form.
 *
 * A warehouse is one site (e.g. "Krus5K") with one set of details — name,
 * address, contact, etc. Main / Purchase / Returns / Damage are NOT
 * separate warehouses; they're four fixed zone labels shown under every
 * site in the tree. Each zone keeps its own independent list of
 * positions — its "create warehouse location" link opens
 * WarehouseLocationModal scoped to that one site + zone pair, not the
 * whole site.
 */
export class SettingsController {
  constructor({ warehouseStore, locationStore, refs }) {
    this.warehouseStore = warehouseStore;
    this.locationStore = locationStore;
    this.refs = refs;
    this.selectedWarehouseId = null;
    this.collapsedWarehouses = new Set();
    this._defaultCollapseApplied = false;
  }

  init() {
    this._bindNav();
    this._bindTreeToolbar();
    this.warehouseStore.on('change', () => this.renderTree());
    this.renderTree();
  }

  // ---- Settings left rail (General / Basic Configuration / Warehouse Information) ----

  _bindNav() {
    const { settingsNav } = this.refs;
    if (!settingsNav) return;

    settingsNav.querySelectorAll('[data-settings-toggle]').forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const sub = toggle.parentElement.querySelector('.settings-nav-sub');
        const willOpen = sub.hidden;
        sub.hidden = !willOpen;
        toggle.classList.toggle('open', willOpen);
      });
    });

    settingsNav.querySelectorAll('[data-settings-section]').forEach((btn) => {
      btn.addEventListener('click', () => {
        settingsNav.querySelectorAll('[data-settings-section]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.getAttribute('data-settings-section');
        qsa('[data-settings-content]').forEach((section) => {
          section.hidden = section.getAttribute('data-settings-content') !== target;
        });
      });
    });
  }

  // ---- Warehouse tree ----

  _bindTreeToolbar() {
    const { whAddBtn, whImportBtn, whImportFileInput } = this.refs;

    whAddBtn?.addEventListener('click', () => this._openAddWarehouseModal());

    whImportBtn?.addEventListener('click', () => whImportFileInput?.click());
    whImportFileInput?.addEventListener('change', async () => {
      const file = whImportFileInput.files?.[0];
      whImportFileInput.value = '';
      if (!file) return;
      await this._importCsv(file);
    });
  }

  /** "+ Add" creates one warehouse (one site) — its name is the only thing asked up front; everything else is filled in on the details form afterward. */
  _openAddWarehouseModal() {
    const body = el(`
      <form class="gadget-form" novalidate>
        <div class="field">
          <label for="whNewName">Warehouse name</label>
          <input type="text" id="whNewName" placeholder="e.g. Warehouse123">
          <div class="field-error" data-error-for="name"></div>
        </div>
      </form>
    `);

    const modal = new Modal({
      title: 'Add warehouse',
      body,
      footer: [
        { label: 'Cancel', variant: 'btn-outline', onClick: (m) => m.close() },
        {
          label: 'Add',
          variant: 'btn-accent',
          onClick: (m) => {
            const nameInput = body.querySelector('#whNewName');
            const errEl = body.querySelector('[data-error-for="name"]');
            const name = nameInput.value.trim();
            errEl.textContent = '';
            nameInput.classList.remove('invalid');

            if (!name) {
              errEl.textContent = 'Warehouse name is required.';
              nameInput.classList.add('invalid');
              return;
            }
            const alreadyExists = this.warehouseStore.list().some((w) => w.name.toLowerCase() === name.toLowerCase());
            if (alreadyExists) {
              errEl.textContent = `"${name}" already exists — pick a different name.`;
              nameInput.classList.add('invalid');
              return;
            }

            const warehouse = this.warehouseStore.create({ name });
            this.selectedWarehouseId = warehouse.id;
            this.renderTree();
            this.renderDetail(warehouse);
            Toast.success(`"${name}" added — fill in its details and Save.`);
            m.close();
          }
        }
      ]
    });
    modal.open();
    requestAnimationFrame(() => body.querySelector('#whNewName')?.focus());
  }

  async _importCsv(file) {
    try {
      const text = await readCsvFile(file);
      const rows = parseCsv(text);
      if (rows.length === 0) { Toast.error('That file has no rows.'); return; }

      const header = rows[0].map((h) => h.trim().toLowerCase());
      const dataRows = rows.slice(1);
      const idx = (name) => header.indexOf(name);
      const nameIdx = idx('name');

      let created = 0;
      let skipped = 0;
      dataRows.forEach((row) => {
        const name = nameIdx >= 0 ? (row[nameIdx] || '').trim() : '';
        if (!name) { skipped++; return; }
        this.warehouseStore.create({
          name,
          contactPerson: idx('contactperson') >= 0 ? (row[idx('contactperson')] || '').trim() : '',
          phoneNumber: idx('phonenumber') >= 0 ? (row[idx('phonenumber')] || '').trim() : '',
          fullAddress: idx('fulladdress') >= 0 ? (row[idx('fulladdress')] || '').trim() : ''
        });
        created++;
      });

      if (created === 0) Toast.error('No valid rows found. Expected a "name" column at least.');
      else Toast.success(`Imported ${created} warehouse${created === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped, missing name)` : ''}.`);
    } catch (err) {
      console.error('Warehouse import failed', err);
      Toast.error('Could not read that file.');
    }
  }

  renderTree() {
    const { warehouseTree } = this.refs;
    if (!warehouseTree) return;
    warehouseTree.innerHTML = '';

    const warehouses = this.warehouseStore.list();

    // Open only the first site (oldest — warehouseStore is fetched
    // oldest-to-newest, see app.js) by default, instead of the tree
    // starting with every site's zones expanded at once — and show its
    // details right away instead of the panel starting on "Select a
    // warehouse on the left". Applied once, the first time there's data
    // to look at — a store 'change' after that (adding/editing/deleting a
    // site) re-renders without touching whatever the person's since
    // expanded/collapsed or selected by hand.
    if (!this._defaultCollapseApplied && warehouses.length > 0) {
      warehouses.slice(1).forEach((w) => this.collapsedWarehouses.add(w.id));
      this._defaultCollapseApplied = true;
      if (!this.selectedWarehouseId) {
        this.selectedWarehouseId = warehouses[0].id;
        this.renderDetail(warehouses[0]);
      }
    }

    if (warehouses.length === 0) {
      warehouseTree.appendChild(el(`<div class="wh-tree-empty">No warehouses yet — use "+ Add" above.</div>`));
      return;
    }

    warehouses.forEach((warehouse) => {
      const isCollapsed = this.collapsedWarehouses.has(warehouse.id);

      const group = el(`<div class="wh-tree-name-group"></div>`);
      const header = el(`
        <button type="button" class="wh-tree-name-header${warehouse.id === this.selectedWarehouseId ? ' active' : ''}">
          <span class="wh-tree-caret${isCollapsed ? ' collapsed' : ''}">▾</span>
          <span>${esc(warehouse.name)}</span>
        </button>
      `);
      header.querySelector('.wh-tree-caret').addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.collapsedWarehouses.has(warehouse.id)) this.collapsedWarehouses.delete(warehouse.id);
        else this.collapsedWarehouses.add(warehouse.id);
        this.renderTree();
      });
      header.addEventListener('click', () => {
        this.selectedWarehouseId = warehouse.id;
        this.renderDetail(warehouse);
        this.renderTree();
      });
      group.appendChild(header);

      // Main / Purchase / Returns / Damage — fixed labels, not separate
      // records. Every one of them just opens this same site's location
      // list; there is nothing else to select here.
      const zoneList = el(`<div class="wh-zone-list"></div>`);
      zoneList.hidden = isCollapsed;
      WAREHOUSE_TYPES.forEach((zone) => {
        const item = el(`
          <div class="wh-zone-item">
            <span class="wh-zone-label">${esc(zone.label)}</span>
            <button type="button" class="wh-tree-location-link">create warehouse location</button>
          </div>
        `);
        item.querySelector('.wh-tree-location-link').addEventListener('click', () => {
          openWarehouseLocationModal({ warehouse, zone, locationStore: this.locationStore });
        });
        zoneList.appendChild(item);
      });
      group.appendChild(zoneList);

      warehouseTree.appendChild(group);
    });
  }

  // ---- Warehouse detail form ----

  renderDetail(warehouse) {
    const { warehouseDetailPanel } = this.refs;
    if (!warehouseDetailPanel) return;
    warehouseDetailPanel.innerHTML = '';

    if (!warehouse) {
      warehouseDetailPanel.appendChild(el(`<div class="warehouse-detail-empty">Select a warehouse on the left, or add a new one.</div>`));
      return;
    }

    const wrap = el(`<div class="warehouse-detail-wrap"></div>`);
    wrap.appendChild(el(`<h3 class="warehouse-detail-title">Warehouse details</h3>`));

    const form = buildWarehouseForm(warehouse);
    wrap.appendChild(form.node);

    const actions = el(`
      <div class="warehouse-detail-actions">
        <button type="button" class="btn btn-danger" data-action="delete">Delete</button>
        <button type="button" class="btn btn-accent" data-action="save">Save</button>
      </div>
    `);
    wrap.appendChild(actions);

    actions.querySelector('[data-action="save"]').addEventListener('click', () => {
      const data = form.getData();
      const { valid, errors } = Warehouse.validate(data);
      if (!valid) { form.showErrors(errors); Toast.error('Please fix the highlighted fields.'); return; }
      this.warehouseStore.update(warehouse.id, data);
      Toast.success('Warehouse saved.');
    });

    actions.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Delete warehouse?',
        message: `This removes "${warehouse.name}" — including its Main, Purchase, Returns, and Damage zones — in one step, and cannot be undone. Positions generated under it will remain orphaned in storage but are no longer reachable.`,
        confirmLabel: 'Delete',
        danger: true
      });
      if (!ok) return;
      this.warehouseStore.delete(warehouse.id);
      this.selectedWarehouseId = null;
      this.renderTree();
      this.renderDetail(null);
      Toast.success('Warehouse deleted.');
    });

    warehouseDetailPanel.appendChild(wrap);
  }
}
