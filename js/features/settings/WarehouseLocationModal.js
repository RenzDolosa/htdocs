import { Modal } from '../../components/Modal.js';
import { el, esc } from '../../utils/dom.js';
import { Toast } from '../../components/Toast.js';
import { confirmDialog } from '../../components/ConfirmDialog.js';
import { openDropdownMenu } from '../../components/DropdownMenu.js';
import { generateId } from '../../utils/id.js';
import { toCsv, downloadCsv } from '../../utils/csv.js';
import { fmtLocalDateStamp } from '../../utils/format.js';
import { POSITION_TYPES, TYPE_LABEL } from '../../models/WarehouseLocation.js';

// POSITION_TYPES / TYPE_LABEL now live in models/WarehouseLocation.js — the
// single source of truth shared with utils/merchantPlacement.js, so a
// position's type reads identically here, in Manage's derived Position
// Type column, and in the manifest placement preview.

/**
 * A select-like filter control that looks like a bordered input with a
 * dropdown caret, but opens a DropdownMenu popover instead of a native
 * <select> list. Its placeholder text (e.g. "Whether to enable") is shown
 * only in the closed/unselected state — it is deliberately not one of the
 * selectable menu items, since it represents "no filter chosen" rather
 * than a real option.
 */
function buildFilterDropdown({ placeholder, options, onSelect }) {
  const trigger = el(`
    <button type="button" class="filter-dropdown-trigger is-placeholder">
      <span class="filter-dropdown-label">${esc(placeholder)}</span>
      <span class="filter-dropdown-caret">▾</span>
    </button>
  `);
  const labelEl = trigger.querySelector('.filter-dropdown-label');

  function setValue(value) {
    const match = options.find((o) => o.value === value);
    labelEl.textContent = match ? match.label : placeholder;
    trigger.classList.toggle('is-placeholder', !match);
  }

  trigger.addEventListener('click', () => {
    openDropdownMenu({
      anchor: trigger,
      items: options.map((o) => ({
        label: o.label,
        onClick: () => { setValue(o.value); onSelect(o.value); }
      }))
    });
  });

  return { node: trigger, setValue };
}

/** Renders the "Create a new position" form and wires its Save button. */
function openGeneratePositionModal({ warehouse, zone, locationStore, defaultArea, onSaved }) {
  const body = el(`
    <div class="genpos-wrap">
      <form class="gadget-form genpos-form" novalidate>
        <div class="field">
          <label for="gpArea">Area <span class="required-mark">*</span></label>
          <input type="text" id="gpArea" name="area" maxlength="64" placeholder="e.g. 3RD">
          <div class="field-error" data-error-for="area"></div>
        </div>

        <div class="field">
          <label>Position Properties</label>
          <div class="genpos-radios">
            ${POSITION_TYPES.map((t, i) => `<label><input type="radio" name="gpProperty" value="${t.value}" ${i === 0 ? 'checked' : ''}> ${esc(t.label)}</label>`).join('')}
          </div>
        </div>
      </form>
    </div>
  `);

  if (defaultArea) body.querySelector('#gpArea').value = defaultArea;

  const showError = (field, message) => {
    const errEl = body.querySelector(`[data-error-for="${field}"]`);
    if (errEl) errEl.textContent = message;
  };
  const clearErrors = () => body.querySelectorAll('[data-error-for]').forEach((n) => { n.textContent = ''; });

  const modal = new Modal({
    title: 'Create a new position',
    body,
    size: 'md',
    footer: [
      { label: 'Cancel', variant: 'btn-outline', onClick: (m) => m.close() },
      {
        label: 'Save',
        variant: 'btn-accent',
        onClick: (m) => {
          clearErrors();

          const area = body.querySelector('#gpArea').value.trim();
          const property = body.querySelector('input[name="gpProperty"]:checked').value;

          if (!area) { showError('area', 'Area is required.'); return; }

          const existingCodes = new Set(locationStore.list().filter((l) => l.warehouseId === warehouse.id && l.zone === zone.value).map((l) => l.locationCode));
          if (existingCodes.has(area)) { showError('area', 'A position with this area already exists.'); return; }

          locationStore.create({
            warehouseId: warehouse.id,
            zone: zone.value,
            area,
            locationCode: area,
            positionNumber: `${warehouse.warehouseCode}${generateId('').replace(/[^0-9]/g, '').padEnd(10, '0').slice(0, 10)}`,
            property,
            enabled: true
          });

          Toast.success('Position created.');
          onSaved?.();
          m.close();
        }
      }
    ]
  });
  modal.open();
  requestAnimationFrame(() => body.querySelector('#gpArea')?.focus());
}

/** Builds a compact page-number list with 1 / current-neighbors / last, using '…' for gaps. */
function pageList(current, total) {
  const delta = 1;
  const range = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) range.push(i);
  }
  const withDots = [];
  let last = null;
  range.forEach((i) => {
    if (last !== null) {
      if (i - last === 2) withDots.push(last + 1);
      else if (i - last > 2) withDots.push('…');
    }
    withDots.push(i);
    last = i;
  });
  return withDots;
}

function renderAreaTree(treeEl, warehouse, zone, locationStore, activeArea, onSelect) {
  const areas = [...new Set(locationStore.list().filter((l) => l.warehouseId === warehouse.id && l.zone === zone.value).map((l) => l.area))].sort();
  treeEl.innerHTML = '';
  const allBtn = el(`<button type="button" class="area-tree-item${!activeArea ? ' active' : ''}">All areas</button>`);
  allBtn.addEventListener('click', () => onSelect(''));
  treeEl.appendChild(allBtn);
  areas.forEach((area) => {
    const btn = el(`<button type="button" class="area-tree-item${area === activeArea ? ' active' : ''}">${esc(area)} Area</button>`);
    btn.addEventListener('click', () => onSelect(area));
    treeEl.appendChild(btn);
  });
  if (areas.length === 0) {
    treeEl.appendChild(el(`<div class="area-tree-empty">No areas yet</div>`));
  }
}

/**
 * Opens the "create warehouse location" modal for one site + zone pair
 * (e.g. "Krus5K" · Purchase Warehouse): an area tree on the left, a
 * filterable/paginated/selectable position table on the right scoped to
 * that zone, and the entry point into "Generate a new position" (the
 * bulk range-based creator above).
 */
export function openWarehouseLocationModal({ warehouse, zone, locationStore }) {
  let activeArea = '';
  let keyword = '';
  let enabledFilter = 'all';
  let typeFilter = 'all';
  let page = 1;
  let pageSize = 50;
  const selected = new Set();

  const body = el(`
    <div class="loc-modal-body">
      <div class="loc-modal-tree"></div>
      <div class="loc-modal-main">
        <div class="loc-modal-toolbar">
          <input type="text" class="loc-search" placeholder="Search position">
          <div class="loc-enabled-filter-mount"></div>
          <div class="loc-type-filter-mount"></div>
          <button type="button" class="btn btn-outline btn-sm loc-search-btn">Search</button>
          <button type="button" class="btn btn-outline btn-sm loc-reset-btn">Reset</button>
        </div>
        <div class="loc-modal-actions">
          <div class="actionbar-left">
            <button type="button" class="link-btn loc-generate-btn">+ Generate a new position</button>
            <span class="link-sep">|</span>
            <button type="button" class="link-btn loc-delete-btn" style="display:none;">Delete</button>
            <span class="link-sep loc-delete-sep" style="display:none;">|</span>
            <button type="button" class="link-btn loc-enable-btn" style="display:none;">Enable</button>
            <span class="link-sep loc-enable-sep" style="display:none;">|</span>
            <button type="button" class="link-btn loc-deactivate-btn" style="display:none;">Deactivate</button>
            <span class="link-sep loc-changetype-sep" style="display:none;">|</span>
            <button type="button" class="link-btn loc-changetype-btn" style="display:none;">Change type ▾</button>
          </div>
          <div class="actionbar-right">
            <button type="button" class="btn btn-outline btn-sm loc-export-btn">Export</button>
          </div>
        </div>
        <div class="loc-table-wrap">
          <table>
            <thead>
              <tr>
                <th data-label="SN" class="sn-col" style="width:30px;"><div style="display: flex; justify-content: end; padding: 0;"></div></th>
                <th class="checkbox-col" style="width:36px;"><div><input type="checkbox" class="loc-select-all" aria-label="Select all on this page" style="height: 15px; width: 15px;"></div></th>
                <th data-label="Location"><div>Location</div></th>
                <th data-label="Enable" style="width:80px;"><div>Enable</div></th>
                <th data-label="Types of"><div>Types of</div></th>
                <th data-label="Position Number"><div>Position Number</div></th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
        <div class="loc-table-footer">
          <div class="loc-footer-left">
            <span class="loc-checked-count">Checked 0</span>
            <span class="loc-total-count">Total 0</span>
          </div>
          <div class="loc-footer-right">
            <select class="loc-page-size">
              <option value="20">20/page</option>
              <option value="50" selected>50/page</option>
              <option value="100">100/page</option>
            </select>
            <button type="button" class="page-nav loc-prev-page" aria-label="Previous page">‹</button>
            <div class="page-numbers loc-page-numbers"></div>
            <button type="button" class="page-nav loc-next-page" aria-label="Next page">›</button>
            <span class="goto-label">Go to</span>
            <input type="number" class="loc-goto-input" min="1" value="1">
            <button type="button" class="btn btn-outline btn-sm loc-goto-btn">Go</button>
          </div>
        </div>
      </div>
    </div>
  `);

  const treeEl = body.querySelector('.loc-modal-tree');
  const tbody = body.querySelector('tbody');
  const searchInput = body.querySelector('.loc-search');
  const enabledDropdown = buildFilterDropdown({
    placeholder: 'Whether to enable',
    options: [{ value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }],
    onSelect: (value) => { enabledFilter = value; page = 1; refresh(); }
  });
  body.querySelector('.loc-enabled-filter-mount').appendChild(enabledDropdown.node);
  const typeDropdown = buildFilterDropdown({
    placeholder: 'Types of',
    options: POSITION_TYPES,
    onSelect: (value) => { typeFilter = value; page = 1; refresh(); }
  });
  body.querySelector('.loc-type-filter-mount').appendChild(typeDropdown.node);
  const selectAllEl = body.querySelector('.loc-select-all');
  const deleteBtn = body.querySelector('.loc-delete-btn');
  const deleteSep = body.querySelector('.loc-delete-sep');
  const enableBtn = body.querySelector('.loc-enable-btn');
  const enableSep = body.querySelector('.loc-enable-sep');
  const deactivateBtn = body.querySelector('.loc-deactivate-btn');
  const changeTypeBtn = body.querySelector('.loc-changetype-btn');
  const changeTypeSep = body.querySelector('.loc-changetype-sep');

  function filteredLocations() {
    return locationStore.list().filter((l) => {
      if (l.warehouseId !== warehouse.id) return false;
      if (l.zone !== zone.value) return false;
      if (activeArea && l.area !== activeArea) return false;
      if (keyword && !l.locationCode.toLowerCase().includes(keyword.toLowerCase())) return false;
      if (enabledFilter === 'enabled' && !l.enabled) return false;
      if (enabledFilter === 'disabled' && l.enabled) return false;
      if (typeFilter !== 'all' && l.property !== typeFilter) return false;
      return true;
    });
  }

  function updateBulkActionVisibility() {
    const show = selected.size > 0;
    deleteBtn.style.display = show ? '' : 'none';
    deleteSep.style.display = show ? '' : 'none';
    enableBtn.style.display = show ? '' : 'none';
    enableSep.style.display = show ? '' : 'none';
    deactivateBtn.style.display = show ? '' : 'none';
    changeTypeSep.style.display = show ? '' : 'none';
    changeTypeBtn.style.display = show ? '' : 'none';
  }

  function refresh() {
    renderAreaTree(treeEl, warehouse, zone, locationStore, activeArea, (area) => {
      activeArea = area;
      page = 1;
      refresh();
    });

    const filtered = filteredLocations();
    const allIds = new Set(filtered.map((l) => l.id));
    [...selected].forEach((id) => { if (!allIds.has(id)) selected.delete(id); });

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    const start = (page - 1) * pageSize;
    const pageItems = filtered.slice(start, start + pageSize);

    tbody.innerHTML = '';
    if (pageItems.length === 0) {
      tbody.appendChild(el(`<tr><td colspan="6" class="genpos-empty-row">No positions match here. Use "Generate a new position" to create some.</td></tr>`));
    } else {
      pageItems.forEach((loc, index) => {
        const row = el(`
          <tr class="${selected.has(loc.id) ? 'row-selected' : ''}">
            <td data-label="SN" class="sn-col"><div style="display: flex; justify-content: end; padding: 0;">${start + index + 1}</div></td>
            <td class="checkbox-col"><div><input type="checkbox" class="loc-row-check" ${selected.has(loc.id) ? 'checked' : ''} aria-label="Select position" style="height: 15px; width: 15px;"></div></td>
            <td data-label="Location"><div><span class="code-tag"><span class="bars"></span>${esc(loc.locationCode)}</span></div></td>
            <td data-label="Enable"><div><input type="checkbox" class="loc-enable-toggle" ${loc.enabled ? 'checked' : ''} aria-label="Enabled" style="height: 15px; width: 15px;"></div></td>
            <td data-label="Types of"><div><span class="pill pill-cat">${esc(TYPE_LABEL[loc.property] || loc.property)}</span></div></td>
            <td data-label="Position Number"><div class="genpos-position-number">${esc(loc.positionNumber)}</div></td>
          </tr>
        `);
        row.querySelector('.loc-enable-toggle').addEventListener('change', (e) => {
          locationStore.update(loc.id, { enabled: e.target.checked });
        });
        row.querySelector('.loc-row-check').addEventListener('change', (e) => {
          if (e.target.checked) selected.add(loc.id);
          else selected.delete(loc.id);
          updateBulkActionVisibility();
          syncSelectAllCheckbox(pageItems);
        });
        tbody.appendChild(row);
      });
    }

    body.querySelector('.loc-checked-count').textContent = `Checked ${selected.size}`;
    body.querySelector('.loc-total-count').textContent = `Total ${totalItems}`;

    const prevBtn = body.querySelector('.loc-prev-page');
    const nextBtn = body.querySelector('.loc-next-page');
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
    body.querySelector('.loc-page-numbers').innerHTML = pageList(page, totalPages).map((entry) =>
      entry === '…'
        ? `<span class="page-ellipsis">…</span>`
        : `<button type="button" class="page-btn${entry === page ? ' active' : ''}" data-page="${entry}">${entry}</button>`
    ).join('');
    body.querySelectorAll('.loc-page-numbers .page-btn').forEach((btn) => {
      btn.addEventListener('click', () => { page = Number(btn.getAttribute('data-page')); refresh(); });
    });
    body.querySelector('.loc-goto-input').max = String(totalPages);
    body.querySelector('.loc-goto-input').value = String(page);

    syncSelectAllCheckbox(pageItems);
    updateBulkActionVisibility();
  }

  function syncSelectAllCheckbox(pageItems) {
    if (pageItems.length === 0) {
      selectAllEl.checked = false;
      selectAllEl.indeterminate = false;
      return;
    }
    const selectedOnPage = pageItems.filter((l) => selected.has(l.id)).length;
    selectAllEl.checked = selectedOnPage === pageItems.length;
    selectAllEl.indeterminate = selectedOnPage > 0 && selectedOnPage < pageItems.length;
  }

  selectAllEl.addEventListener('change', (e) => {
    const start = (page - 1) * pageSize;
    const pageItems = filteredLocations().slice(start, start + pageSize);
    pageItems.forEach((l) => {
      if (e.target.checked) selected.add(l.id);
      else selected.delete(l.id);
    });
    refresh();
  });

  body.querySelector('.loc-search-btn').addEventListener('click', () => {
    keyword = searchInput.value.trim();
    page = 1;
    refresh();
  });
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') body.querySelector('.loc-search-btn').click(); });
  body.querySelector('.loc-reset-btn').addEventListener('click', () => {
    keyword = ''; searchInput.value = '';
    enabledFilter = 'all'; enabledDropdown.setValue(null);
    typeFilter = 'all'; typeDropdown.setValue(null);
    page = 1;
    refresh();
  });

  body.querySelector('.loc-generate-btn').addEventListener('click', () => {
    openGeneratePositionModal({ warehouse, zone, locationStore, defaultArea: activeArea, onSaved: refresh });
  });

  deleteBtn.addEventListener('click', async () => {
    const count = selected.size;
    if (count === 0) return;
    const ok = await confirmDialog({
      title: 'Delete positions',
      message: `Delete ${count} selected position${count === 1 ? '' : 's'}? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    selected.forEach((id) => locationStore.delete(id));
    selected.clear();
    Toast.show(`Deleted ${count} position${count === 1 ? '' : 's'}.`);
  });

  enableBtn.addEventListener('click', () => {
    const count = selected.size;
    if (count === 0) return;
    selected.forEach((id) => locationStore.update(id, { enabled: true }));
    Toast.success(`Enabled ${count} position${count === 1 ? '' : 's'}.`);
  });

  deactivateBtn.addEventListener('click', () => {
    const count = selected.size;
    if (count === 0) return;
    selected.forEach((id) => locationStore.update(id, { enabled: false }));
    Toast.success(`Deactivated ${count} position${count === 1 ? '' : 's'}.`);
  });

  changeTypeBtn.addEventListener('click', () => {
    if (selected.size === 0) return;
    openDropdownMenu({
      anchor: changeTypeBtn,
      items: POSITION_TYPES.map((t) => ({
        label: t.label,
        onClick: () => {
          const count = selected.size;
          selected.forEach((id) => locationStore.update(id, { property: t.value }));
          Toast.success(`Changed ${count} position${count === 1 ? '' : 's'} to "${t.label}".`);
        }
      }))
    });
  });

  body.querySelector('.loc-export-btn').addEventListener('click', () => {
    const rows = filteredLocations();
    if (rows.length === 0) {
      Toast.show('There is nothing to export.');
      return;
    }
    const csv = toCsv(
      ['Location', 'Enable', 'Types of', 'Position Number'],
      rows.map((l) => [l.locationCode, l.enabled ? 'Enabled' : 'Disabled', TYPE_LABEL[l.property] || l.property, l.positionNumber])
    );
    downloadCsv(csv, `warehouse-locations-${fmtLocalDateStamp()}.csv`);
    Toast.success(`Exported ${rows.length} position${rows.length === 1 ? '' : 's'} to CSV.`);
  });

  body.querySelector('.loc-page-size').addEventListener('change', (e) => {
    pageSize = Number(e.target.value);
    page = 1;
    refresh();
  });
  body.querySelector('.loc-prev-page').addEventListener('click', () => { page -= 1; refresh(); });
  body.querySelector('.loc-next-page').addEventListener('click', () => { page += 1; refresh(); });
  body.querySelector('.loc-goto-btn').addEventListener('click', () => {
    page = Number(body.querySelector('.loc-goto-input').value) || 1;
    refresh();
  });

  const unsubscribe = locationStore.on('change', refresh);

  const modal = new Modal({
    title: `Warehouse location — ${warehouse.name} · ${zone.label}`,
    body,
    size: 'lg',
    onClose: () => unsubscribe(),
    footer: [{ label: 'Close', variant: 'btn-outline', onClick: (m) => m.close() }]
  });
  modal.open();
  refresh();
}

export { POSITION_TYPES, TYPE_LABEL };