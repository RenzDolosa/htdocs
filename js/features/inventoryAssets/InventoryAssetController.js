import { Modal } from '../../components/Modal.js';
import { Toast } from '../../components/Toast.js';
import { confirmDialog } from '../../components/ConfirmDialog.js';
import { openDropdownMenu } from '../../components/DropdownMenu.js';
import { InventoryAsset } from '../../models/InventoryAsset.js';
import { buildInventoryAssetForm } from './InventoryAssetForm.js';
import { toCsv, parseCsv, downloadCsv, readCsvFile } from '../../utils/csv.js';
import { processInChunks } from '../../utils/asyncBatch.js';
import { buildImportProgress } from '../../components/ImportProgress.js';
import { el } from '../../utils/dom.js';
import { fmtLocalDateTime, fmtLocalDateStamp } from '../../utils/format.js';

/** Column order/labels shared by the export template and the importer. */
const IMPORT_HEADERS = ['Category', 'Serial Number', 'Asset Tag', 'MAC Address', 'IMEI 1', 'IMEI 2'];

export class InventoryAssetController {
  constructor({ store, view, refs }) {
    this.store = store;
    this.view = view;
    this.refs = refs;

    this.state = {
      filters: { keyword: '', category: 'all' },
      sortBy: 'createdAt',
      sortDir: 'desc',
      page: 1,
      pageSize: 50
    };
    this.selected = new Set();

    this.store.on('change', () => this.render());
    this._bindFilterBar();
    this._bindActionBar();
    this._bindTableHead();
  }

  init() {
    this.render();
  }

  // ---------- Derived data ----------
  _knownCategories() {
    return [...new Set(this.store.list().map((a) => a.category).filter(Boolean))].sort();
  }

  /** Serial numbers (lowercased, trimmed) that appear on more than one record, inventory-wide. */
  _duplicateSerialSet() {
    const counts = new Map();
    this.store.list().forEach((a) => {
      const key = (a.serialNumber || '').trim().toLowerCase();
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
  }

  _filteredSortedAssets() {
    const f = this.state.filters;
    const kw = f.keyword.trim().toLowerCase();

    let assets = this.store.list().filter((a) => {
      if (f.category !== 'all' && a.category !== f.category) return false;
      if (kw) {
        const haystack = [a.category, a.serialNumber, a.assetTag, a.macAddress].join(' ').toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      return true;
    });

    const dir = this.state.sortDir === 'asc' ? 1 : -1;
    assets = assets.slice().sort((a, b) => {
      let va, vb;
      switch (this.state.sortBy) {
        case 'category': va = a.category.toLowerCase(); vb = b.category.toLowerCase(); break;
        case 'serialNumber': va = (a.serialNumber || '').toLowerCase(); vb = (b.serialNumber || '').toLowerCase(); break;
        default: va = a.createdAt; vb = b.createdAt;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return assets;
  }

  // ---------- Rendering ----------
  render() {
    const allIds = new Set(this.store.list().map((a) => a.id));
    this.selected.forEach((id) => { if (!allIds.has(id)) this.selected.delete(id); });

    const filtered = this._filteredSortedAssets();
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / this.state.pageSize));
    if (this.state.page > totalPages) this.state.page = totalPages;
    if (this.state.page < 1) this.state.page = 1;

    const start = (this.state.page - 1) * this.state.pageSize;
    const pageAssets = filtered.slice(start, start + this.state.pageSize);

    this.view.renderFilterOptions(this._knownCategories(), this.state.filters.category);
    this.view.renderTable(pageAssets, this.selected, {
      onEdit: (id) => this.openEditModal(id),
      onDelete: (id) => this.deleteAsset(id),
      onToggleSelect: (id, checked) => this._toggleSelect(id, checked),
      onToggleSelectAll: (checked) => this._toggleSelectAll(pageAssets, checked)
    }, this._duplicateSerialSet());
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
  }

  _goToPage(page) {
    this.state.page = page;
    this.render();
  }

  // ---------- Selection ----------
  _toggleSelect(id, checked) {
    if (checked) this.selected.add(id);
    else this.selected.delete(id);
    this.render();
  }

  _toggleSelectAll(pageAssets, checked) {
    pageAssets.forEach((a) => {
      if (checked) this.selected.add(a.id);
      else this.selected.delete(a.id);
    });
    this.render();
  }

  _updateBulkDeleteVisibility() {
    const show = this.selected.size > 0;
    this.refs.bulkDeleteBtn.style.display = show ? '' : 'none';
    this.refs.bulkDeleteSep.style.display = show ? '' : 'none';
  }

  async _deleteSelected() {
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
    this.refs.filterKeyword.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._applyFilters(); });
    this.refs.searchBtn.addEventListener('click', () => this._applyFilters());
    this.refs.resetBtn.addEventListener('click', () => this._resetFilters());
    this.refs.filterCategory.addEventListener('change', () => this._applyFilters());
  }

  _applyFilters() {
    this.state.filters = {
      keyword: this.refs.filterKeyword.value,
      category: this.refs.filterCategory.value
    };
    this.state.page = 1;
    this.render();
  }

  _resetFilters() {
    this.refs.filterKeyword.value = '';
    this.state.filters = { keyword: '', category: 'all' };
    this.state.page = 1;
    this.render();
  }

  // ---------- Action bar / table head bindings ----------
  _bindActionBar() {
    this.refs.addItemBtn.addEventListener('click', () => this._openAddOptionsMenu());
    this.refs.emptyAddBtn.addEventListener('click', () => this.openAddModal());
    this.refs.bulkDeleteBtn.addEventListener('click', () => this._deleteSelected());
    this.refs.clearAllBtn.addEventListener('click', () => this.clearAll());
    this.refs.refreshBtn.addEventListener('click', () => this.render());
    this.refs.exportBtn.addEventListener('click', () => this.exportCsv());
    this.refs.importFileInput.addEventListener('change', (e) => this._handleImportFile(e));
  }

  /** "+ Add asset" branches into two paths, same as the Manage panel:
   * a manual entry (Add Asset, same modal/logic as before) or a bulk CSV
   * Import — opened from a single shared DropdownMenu so only one menu
   * can ever be open across the whole app at once. */
  _openAddOptionsMenu() {
    openDropdownMenu({
      anchor: this.refs.addItemBtn,
      items: [
        { label: 'Add Asset', onClick: () => this.openAddModal() },
        { label: 'Import', onClick: () => this.openImportModal() }
      ]
    });
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

  // ---------- CRUD orchestration ----------
  openAddModal() {
    this._openAssetModal(null);
  }

  openEditModal(id) {
    const asset = this.store.get(id);
    if (asset) this._openAssetModal(asset);
  }

  _openAssetModal(asset) {
    const form = buildInventoryAssetForm(asset, this._knownCategories());

    const modal = new Modal({
      title: asset ? 'Edit asset' : 'Add asset',
      body: form.node,
      footer: [
        { label: 'Cancel', variant: 'btn-outline', onClick: (m) => m.close() },
        {
          label: 'Save asset',
          variant: 'btn-accent',
          onClick: (m) => {
            const raw = form.getData();
            const existingAssets = this.store.list().filter((a) => !asset || a.id !== asset.id);
            const { valid, errors } = InventoryAsset.validate(raw, { existingAssets });
            if (!valid) {
              form.showErrors(errors);
              return;
            }
            this._saveAsset(asset, raw);
            m.close();
          }
        }
      ]
    });
    modal.open();
    form.focusFirst();
  }

  _saveAsset(existingAsset, raw) {
    const payload = {
      category: raw.category || 'Uncategorized',
      serialNumber: raw.serialNumber,
      assetTag: raw.assetTag,
      imei1: raw.imei1,
      macAddress: raw.macAddress,
      imei2: raw.imei2,
      createdAt: raw.createdAt
    };

    if (existingAsset) {
      this.store.update(existingAsset.id, payload);
      Toast.success(`Saved changes for ${payload.serialNumber || 'this asset'}.`);
    } else {
      const asset = new InventoryAsset(payload);
      this.store.create(asset);
      Toast.success(`Added ${payload.serialNumber || 'new asset'} to inventory.`);
    }
  }

  async deleteAsset(id) {
    const asset = this.store.get(id);
    if (!asset) return;
    const ok = await confirmDialog({
      title: 'Remove asset',
      message: `Remove "${asset.serialNumber || asset.category}" from inventory? This cannot be undone.`,
      confirmLabel: 'Remove',
      danger: true
    });
    if (!ok) return;
    this.store.delete(id);
    this.selected.delete(id);
    Toast.show(`Removed ${asset.serialNumber || 'asset'}.`);
  }

  async clearAll() {
    if (this.store.list().length === 0) {
      Toast.show('There is nothing to clear.');
      return;
    }
    const ok = await confirmDialog({
      title: 'Clear all data',
      message: 'Delete all inventory asset records from this browser? This cannot be undone.',
      confirmLabel: 'Clear all',
      danger: true
    });
    if (!ok) return;
    this.store.clear();
    this.selected.clear();
    Toast.show('All inventory asset data cleared.');
  }

  // ---------- Export (full data, mirrors Manage's exportCsv) ----------
  exportCsv() {
    const assets = this._filteredSortedAssets();
    if (assets.length === 0) {
      Toast.show('There is nothing to export.');
      return;
    }
    const rows = assets.map((a) => [
      a.category, a.serialNumber, a.assetTag, a.macAddress, a.imei1, a.imei2,
      fmtLocalDateTime(a.createdAt)
    ]);
    const csv = toCsv([...IMPORT_HEADERS, 'Created'], rows);
    downloadCsv(csv, `inventory-assets-${fmtLocalDateStamp()}.csv`);
    Toast.success(`Exported ${assets.length} ${assets.length === 1 ? 'asset' : 'assets'} to CSV.`);
  }

  // ---------- Import / export template ----------
  /** Opens a modal that bundles both halves of the CSV import flow: the
   * export-template download (so the user knows the expected columns) and
   * the file picker that triggers the actual import. Mirrors
   * ManageController.openImportModal() exactly. */
  openImportModal() {
    const progress = buildImportProgress();
    const body = el(`
      <div class="import-modal-body">
        <p class="hint" style="margin-bottom:14px;">Import inventory assets from a CSV file. Download the template to see the exact column format expected, fill it in, then choose your file below.</p>
        <button tabindex="-1" type="button" class="btn btn-outline" id="iaImportExportTemplateBtn" style="margin-bottom:14px;">Export template</button>
        <div class="import-dropzone">
          <button tabindex="-1" type="button" class="btn btn-accent btn-sm" id="iaImportChooseFileBtn">Choose CSV file…</button>
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

    body.querySelector('#iaImportExportTemplateBtn').addEventListener('click', () => this.exportTemplate());
    body.querySelector('#iaImportChooseFileBtn').addEventListener('click', () => {
      this._pendingImportModal = modal;
      this._pendingImportProgress = progress;
      this.refs.importFileInput.click();
    });

    modal.open();
  }

  /** Downloads a blank CSV with the exact headers the importer expects. */
  exportTemplate() {
    const exampleRow = ['Laptop', 'SN-EXAMPLE-0001', 'WH-EXAMPLE', 'AA:BB:CC:DD:EE:FF', 'IMEI-EXAMPLE-1', 'IMEI-EXAMPLE-2'];
    const csv = toCsv(IMPORT_HEADERS, [exampleRow]);
    downloadCsv(csv, 'inventory-assets-template.csv');
    Toast.show('Template downloaded. Replace the example row with your data, then use Import.');
  }

  _handleImportFile(event) {
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
        const chooseBtn = modal?.bodyEl?.querySelector('#iaImportChooseFileBtn');
        const templateBtn = modal?.bodyEl?.querySelector('#iaImportExportTemplateBtn');
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
   * exactly) and creates one InventoryAsset per valid row. Rows with no
   * category, or a serial number that collides with an existing record
   * or an earlier row in the same file, are skipped and counted rather
   * than aborting the whole import.
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
      category: header.indexOf('category'),
      serialNumber: header.indexOf('serial number'),
      assetTag: header.indexOf('asset tag'),
      macAddress: header.indexOf('mac address'),
      imei1: header.indexOf('imei 1'),
      imei2: header.indexOf('imei 2')
    };
    if (colIndex.category === -1) {
      Toast.error('Import file is missing a "Category" column — use Export Template to see the expected format.');
      return;
    }

    const seenSerials = new Set(
      this.store.list().map((a) => (a.serialNumber || '').trim().toLowerCase()).filter(Boolean)
    );

    let created = 0;
    let skippedNoCategory = 0;
    let skippedDuplicateSerial = 0;

    await processInChunks(rows, (cells) => {
      if (cells.every((c) => c.trim() === '')) return; // blank line

      const category = (cells[colIndex.category] || '').trim();
      const serialNumber = colIndex.serialNumber !== -1 ? (cells[colIndex.serialNumber] || '').trim() : '';
      const assetTag = colIndex.assetTag !== -1 ? (cells[colIndex.assetTag] || '').trim() : '';
      const macAddress = colIndex.macAddress !== -1 ? (cells[colIndex.macAddress] || '').trim() : '';
      const imei1 = colIndex.imei1 !== -1 ? (cells[colIndex.imei1] || '').trim() : '';
      const imei2 = colIndex.imei2 !== -1 ? (cells[colIndex.imei2] || '').trim() : '';

      if (!category) {
        skippedNoCategory++;
        return;
      }

      const serialKey = serialNumber.toLowerCase();
      if (serialKey && seenSerials.has(serialKey)) {
        skippedDuplicateSerial++;
        return;
      }
      if (serialKey) seenSerials.add(serialKey);

      this.store.create(new InventoryAsset({ category, serialNumber, assetTag, macAddress, imei1, imei2 }));
      created++;
    }, {
      chunkSize: 25,
      onProgress: (done, total) => progress?.update(done, total)
    });

    if (created > 0) {
      Toast.success(`Imported ${created} ${created === 1 ? 'asset' : 'assets'}.`);
    }
    if (skippedNoCategory > 0 || skippedDuplicateSerial > 0) {
      const parts = [];
      if (skippedNoCategory > 0) parts.push(`${skippedNoCategory} missing a category`);
      if (skippedDuplicateSerial > 0) parts.push(`${skippedDuplicateSerial} duplicate serial number${skippedDuplicateSerial === 1 ? '' : 's'}`);
      Toast.error(`Skipped ${skippedNoCategory + skippedDuplicateSerial} row${skippedNoCategory + skippedDuplicateSerial === 1 ? '' : 's'}: ${parts.join(', ')}.`);
    }
    if (created === 0 && skippedNoCategory === 0 && skippedDuplicateSerial === 0) {
      Toast.show('Nothing to import — the file had no data rows.');
    }
  }
}