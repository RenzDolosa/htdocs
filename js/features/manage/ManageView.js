import { esc, qsa } from '../../utils/dom.js';
import { fmtInt, fmtDate } from '../../utils/format.js';
import { temporaryPositionLabel } from '../../models/Gadget.js';
import { renderPagination } from '../../components/Pagination.js';

/**
 * ManageView owns DOM rendering only. It receives plain data and a table
 * of callbacks — it never touches the Store or localStorage directly.
 */
export class ManageView {
  constructor(refs) {
    this.refs = refs;
    this._revealedPasswords = new Set();
  }

  /** Populates the Category <select> filter, preserving the current selection.
   * Warehouse has exactly one filter control now — the side tab bar
   * (see renderWarehouseFilterButton) — so there's no dropdown to keep in sync here. */
  renderFilterOptions(categories, filters) {
    this._fillSelect(this.refs.filterCategory, categories, 'All categories', filters.category);
  }

  /**
   * Reflects state on the single, always-present "Warehouse" filter
   * button: hidden entirely when there's nothing to filter by (no
   * warehouse exists in Settings yet), otherwise shown and highlighted
   * while a non-"all" filter is active. Its label shows the selected
   * warehouse's name (or "Warehouse" when nothing's selected) — it was
   * previously left as static placeholder text in the HTML and never
   * actually updated here. The button's click handler (which opens the
   * actual flyout of warehouse options) is wired once by the controller —
   * this method never touches innerHTML, so nothing needs re-binding on
   * every render.
   */
  renderWarehouseFilterButton(hasOptions, activeOwner) {
    const btn = this.refs.warehouseFilterBtn;
    if (!btn) return;
    btn.hidden = !hasOptions;
    btn.classList.toggle('active', activeOwner !== 'all');
    btn.textContent = activeOwner === 'all' ? 'Warehouse' : activeOwner;
  }

  _fillSelect(selectEl, options, allLabel, currentValue) {
    selectEl.innerHTML = `<option value="all">${esc(allLabel)}</option>` +
      options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
    selectEl.value = options.includes(currentValue) ? currentValue : 'all';
  }

  renderTable(pageGadgets, selectedIds, handlers, duplicateSerials = new Set(), catalogIssuesById = new Map(), { isAdmin = true } = {}) {
    if (pageGadgets.length === 0) {
      this.refs.tableBody.innerHTML = '';
      this.refs.emptyState.style.display = 'block';
      this._syncSelectAllCheckbox([], selectedIds);
      return;
    }
    this.refs.emptyState.style.display = 'none';

    this.refs.tableBody.innerHTML = pageGadgets.map((g, index) => this._rowHTML(g, index, selectedIds.has(g.id), duplicateSerials, catalogIssuesById.get(g.id), isAdmin)).join('');

    qsa('tr[data-id]', this.refs.tableBody).forEach((row) => {
      const id = row.getAttribute('data-id');
      row.querySelector('[data-action="edit"]').addEventListener('click', () => handlers.onEdit(id));
      row.querySelector('[data-action="log"]').addEventListener('click', () => handlers.onViewLog(id));
      // Deleting is administrator-only — the button itself is rendered
      // disabled below (see _rowHTML), but skip wiring the handler too
      // rather than rely solely on browsers not firing click on a
      // disabled button.
      if (isAdmin) row.querySelector('[data-action="delete"]').addEventListener('click', () => handlers.onDelete(id));
      row.querySelector('[data-action="select-row"]').addEventListener('change', (e) => handlers.onToggleSelect(id, e.target.checked));
      const toggle = row.querySelector('[data-action="reveal-password"]');
      if (toggle) {
        toggle.addEventListener('click', () => {
          if (this._revealedPasswords.has(id)) this._revealedPasswords.delete(id);
          else this._revealedPasswords.add(id);
          handlers.onRerender();
        });
      }
    });

    this.refs.selectAllCheckbox.onchange = (e) => handlers.onToggleSelectAll(e.target.checked);
    this._syncSelectAllCheckbox(pageGadgets, selectedIds);
  }

  _syncSelectAllCheckbox(pageGadgets, selectedIds) {
    const cb = this.refs.selectAllCheckbox;
    if (pageGadgets.length === 0) {
      cb.checked = false;
      cb.indeterminate = false;
      return;
    }
    const selectedOnPage = pageGadgets.filter((g) => selectedIds.has(g.id)).length;
    cb.checked = selectedOnPage === pageGadgets.length;
    cb.indeterminate = selectedOnPage > 0 && selectedOnPage < pageGadgets.length;
  }

  renderSortHeaders(sortBy, sortDir) {
    qsa('th[data-sort]', this.refs.tableHead).forEach((th) => {
      const key = th.getAttribute('data-sort');
      th.classList.toggle('sorted', key === sortBy);
      const arrow = th.querySelector('.arrow');
      if (arrow) arrow.textContent = key === sortBy ? (sortDir === 'asc' ? '↑' : '↓') : '↕';
    });
  }

  /**
   * @param {object} info - { totalItems, selectedCount, page, pageSize, totalPages }
   * @param {object} handlers - { onPrevPage, onNextPage, onPageClick(page), onPageSizeChange(size), onGotoPage(page) }
   */
  renderFooter(info, handlers) {
    const { totalItems, selectedCount, page, pageSize, totalPages } = info;

    this.refs.resultCount.textContent = `${fmtInt(totalItems)} ${totalItems === 1 ? 'asset' : 'assets'}`;
    this.refs.selectedCount.textContent = `Checked ${fmtInt(selectedCount)}`;

    renderPagination(this.refs, { page, pageSize, totalPages }, handlers);
  }

  _rowHTML(g, index, selected, duplicateSerials = new Set(), catalogIssue = null, isAdmin = true) {
    const revealed = this._revealedPasswords.has(g.id);
    const passwordDisplay = g.password
      ? (revealed ? esc(g.password) : '••••••••')
      : '<span style="color:var(--ink-faint);">—</span>';

    const isDuplicateSerial = Boolean(g.serialNumber) && duplicateSerials.has(g.serialNumber.trim().toLowerCase());
    const serialProblems = [];
    if (isDuplicateSerial) serialProblems.push('Duplicate serial number — also used by another asset');
    if (catalogIssue?.serialNumber) serialProblems.push(catalogIssue.serialNumber);
    const serialCellClass = serialProblems.length ? ' class="cell-duplicate-serial"' : '';
    const serialCellTitle = serialProblems.length ? ` title="${esc(serialProblems.join(' / '))}"` : '';

    const catIssue = catalogIssue?.category;
    const tagIssue = catalogIssue?.assetTagDefault;
    const badge = (message) => (message ? `<span class="catalog-flag" title="${esc(message)}">⚠</span>` : '');

    return `
      <tr data-id="${g.id}" class="${selected ? 'row-selected' : ''}">
        <td data-label="SN" class="sn-col"><div style="display: flex; justify-content: end; padding: 0;">${index + 1}</div></td>
        <td class="checkbox-col"><div><input type="checkbox" tabindex="-1" data-action="select-row" ${selected ? 'checked' : ''} aria-label="Select asset" style="height: 15px; width: 15px;"></div></td>
        <td data-label="User"><div class="item-name">${g.user ? esc(g.user) : '<span style="color:var(--ink-faint);">Unassigned</span>'}</div></td>
        <td data-label="Role"><div>${g.role ? esc(g.role) : '<span style="color:var(--ink-faint);">—</span>'}</div></td>
        <td data-label="Category"${catIssue ? ' class="cell-catalog-invalid"' : ''}><div><span class="pill pill-cat">${esc(g.category)}</span> ${badge(catIssue)}</div></td>
        <td data-label="Serial Number"${serialCellClass}${serialCellTitle}><div>${g.serialNumber ? `<span class="code-tag"><span class="bars"></span>${esc(g.serialNumber)}</span>` : '<span style="color:var(--ink-faint);">—</span>'}</div></td>
        <td data-label="Warehouse Asset Tag" style="font-family:var(--font-mono); font-size:12px;"><div>${g.warehouseAssetTag ? esc(g.warehouseAssetTag) : '<span style="color:var(--ink-faint);">—</span>'}</div></td>
        <td data-label="Asset Tag (Default)" style="font-family:var(--font-mono); font-size:12px;"${tagIssue ? ' class="cell-catalog-invalid"' : ''}><div>${g.assetTagDefault ? esc(g.assetTagDefault) : '<span style="color:var(--ink-faint);">—</span>'} ${badge(tagIssue)}</div></td>
        <td data-label="Mac Address" style="font-family:var(--font-mono); font-size:12px;"><div>${g.macAddress ? esc(g.macAddress) : '<span style="color:var(--ink-faint);">—</span>'}</div></td>
        <td data-label="Password">
          <div class="password-cell">
            <span class="password-value">${passwordDisplay}</span>
            ${g.password ? `<button tabindex="-1" class="icon-btn password-reveal-btn" data-action="reveal-password" aria-label="${revealed ? 'Hide password' : 'Reveal password'}" title="${revealed ? 'Hide' : 'Reveal'}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>` : ''}
          </div>
        </td>
        <td data-label="Merchant" style="font-family:var(--font-mono); font-size:12px;"><div>${g.merchant ? esc(g.merchant) : '<span style="color:var(--ink-faint);">—</span>'}</div></td>
        <td data-label="Remarks"><div class="clamp-text" title="${esc(g.remarks)}">${g.remarks ? esc(g.remarks) : '<span style="color:var(--ink-faint);">—</span>'}</div></td>
        <td data-label="Description"><div class="clamp-text" title="${esc(g.description)}">${g.description ? esc(g.description) : '<span style="color:var(--ink-faint);">—</span>'}</div></td>
        <td data-label="PositionType"><div>${
          g.temporaryPosition
            ? `<span title="Temporarily parked in a holding bin, not its normal warehouse">${esc(temporaryPositionLabel(g.temporaryPosition))}</span>`
            : (g.positionType ? esc(g.positionType) : '<span style="color:var(--ink-faint);">Unassigned</span>')
        }</div></td>
        <td data-label="Warehouse"><div>${g.warehouse ? `<span class="pill pill-warehouse">${esc(g.warehouse)}</span>` : '<span style="color:var(--ink-faint);">Unassigned</span>'}</div></td>
        <td data-label="Owner" class="owner-col" style="font-family:var(--font-mono); font-size:12px;"><div>${g.owner ? esc(g.owner) : '<span style="color:var(--ink-faint);">—</span>'}</div></td>
        <td data-label="Created" class="created-col"><div><small>${fmtDate(g.createdAt)}</small></div></td>
        <td data-label="Updated" class="updated-col"><div><small>${fmtDate(g.updatedAt)}</small></div></td>
        <td data-label="Actions">
          <div class="row-actions">
            <button tabindex="-1" class="icon-btn" data-action="edit" aria-label="Edit asset" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            <button tabindex="-1" class="icon-btn" data-action="log" aria-label="View history log" title="View log">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
            </button>
            <button tabindex="-1" class="icon-btn danger" data-action="delete" aria-label="Delete asset" title="${isAdmin ? 'Delete' : 'Only administrators can delete assets.'}" ${isAdmin ? '' : 'disabled'}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }
}