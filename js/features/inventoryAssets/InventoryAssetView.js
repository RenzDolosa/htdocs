import { esc, qsa } from '../../utils/dom.js';
import { fmtInt } from '../../utils/format.js';

/** Formats a stored epoch-ms timestamp as a short, locale-aware date. */
function fmtDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * InventoryAssetView owns DOM rendering only, mirroring ManageView's split
 * of responsibilities: it receives plain data and a table of callbacks,
 * and never touches the Store directly.
 */
export class InventoryAssetView {
  constructor(refs) {
    this.refs = refs;
  }

  renderFilterOptions(categories, currentValue) {
    const select = this.refs.filterCategory;
    select.innerHTML = `<option value="all">All categories</option>` +
      categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    select.value = categories.includes(currentValue) ? currentValue : 'all';
  }

  renderTable(pageAssets, selectedIds, handlers, duplicateSerials = new Set()) {
    if (pageAssets.length === 0) {
      this.refs.tableBody.innerHTML = '';
      this.refs.emptyState.style.display = 'block';
      this._syncSelectAllCheckbox([], selectedIds);
      return;
    }
    this.refs.emptyState.style.display = 'none';

    this.refs.tableBody.innerHTML = pageAssets.map((a, index) => this._rowHTML(a, index, selectedIds.has(a.id), duplicateSerials)).join('');

    qsa('tr[data-id]', this.refs.tableBody).forEach((row) => {
      const id = row.getAttribute('data-id');
      row.querySelector('[data-action="edit"]').addEventListener('click', () => handlers.onEdit(id));
      row.querySelector('[data-action="delete"]').addEventListener('click', () => handlers.onDelete(id));
      row.querySelector('[data-action="select-row"]').addEventListener('change', (e) => handlers.onToggleSelect(id, e.target.checked));
    });

    this.refs.selectAllCheckbox.onchange = (e) => handlers.onToggleSelectAll(e.target.checked);
    this._syncSelectAllCheckbox(pageAssets, selectedIds);
  }

  _syncSelectAllCheckbox(pageAssets, selectedIds) {
    const cb = this.refs.selectAllCheckbox;
    if (pageAssets.length === 0) {
      cb.checked = false;
      cb.indeterminate = false;
      return;
    }
    const selectedOnPage = pageAssets.filter((a) => selectedIds.has(a.id)).length;
    cb.checked = selectedOnPage === pageAssets.length;
    cb.indeterminate = selectedOnPage > 0 && selectedOnPage < pageAssets.length;
  }

  renderSortHeaders(sortBy, sortDir) {
    qsa('th[data-sort]', this.refs.tableHead).forEach((th) => {
      const key = th.getAttribute('data-sort');
      th.classList.toggle('sorted', key === sortBy);
      const arrow = th.querySelector('.arrow');
      if (arrow) arrow.textContent = key === sortBy ? (sortDir === 'asc' ? '↑' : '↓') : '↕';
    });
  }

  /** @param {object} info - { totalItems, selectedCount, page, pageSize, totalPages } */
  renderFooter(info, handlers) {
    const { totalItems, selectedCount, page, pageSize, totalPages } = info;

    this.refs.resultCount.textContent = `${fmtInt(totalItems)} ${totalItems === 1 ? 'asset' : 'assets'}`;
    this.refs.selectedCount.textContent = `Checked ${fmtInt(selectedCount)}`;

    this.refs.pageSizeSelect.value = String(pageSize);
    this.refs.pageSizeSelect.onchange = (e) => handlers.onPageSizeChange(Number(e.target.value));

    this.refs.prevPageBtn.disabled = page <= 1;
    this.refs.prevPageBtn.onclick = () => handlers.onPrevPage();
    this.refs.nextPageBtn.disabled = page >= totalPages;
    this.refs.nextPageBtn.onclick = () => handlers.onNextPage();

    this.refs.pageNumbers.innerHTML = this._pageList(page, totalPages).map((entry) =>
      entry === '…'
        ? `<span class="page-ellipsis">…</span>`
        : `<button type="button" class="page-btn${entry === page ? ' active' : ''}" data-page="${entry}">${entry}</button>`
    ).join('');
    qsa('.page-btn', this.refs.pageNumbers).forEach((btn) => {
      btn.addEventListener('click', () => handlers.onPageClick(Number(btn.getAttribute('data-page'))));
    });

    this.refs.gotoPageInput.max = String(totalPages);
    this.refs.gotoPageInput.value = String(page);
    this.refs.gotoPageBtn.onclick = () => handlers.onGotoPage(Number(this.refs.gotoPageInput.value));
  }

  /** Builds a compact page-number list with 1 / current-neighbors / last, using '…' for gaps. */
  _pageList(current, total) {
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

  _rowHTML(a, index, selected, duplicateSerials) {
    const isDuplicateSerial = Boolean(a.serialNumber) && duplicateSerials.has(a.serialNumber.trim().toLowerCase());
    const serialCellClass = isDuplicateSerial ? ' class="cell-duplicate-serial"' : '';
    const serialCellTitle = isDuplicateSerial ? ' title="Duplicate serial number — also used by another asset"' : '';

    return `
      <tr data-id="${a.id}" class="${selected ? 'row-selected' : ''}">
        <td data-label="SN" class="sn-col"><div style="display: flex; justify-content: end; padding: 0;">${index + 1}</div></td>
        <td class="checkbox-col"><div><input type="checkbox" data-action="select-row" ${selected ? 'checked' : ''} aria-label="Select asset" style="height: 15px; width: 15px;"></div></td>
        <td data-label="Category"><div><span class="pill pill-cat">${esc(a.category)}</span></div></td>
        <td data-label="Serial Number"${serialCellClass}${serialCellTitle}><div>${a.serialNumber ? `<span class="code-tag"><span class="bars"></span>${esc(a.serialNumber)}</span>` : '<span style="color:var(--ink-faint);">—</span>'}</div></td>
        <td data-label="Asset Tag" style="font-family:var(--font-mono); font-size:12px;"><div>${a.assetTag ? esc(a.assetTag) : '<span style="color:var(--ink-faint);">—</span>'}</div></td>
        <td data-label="Mac Address" style="font-family:var(--font-mono); font-size:12px;"><div>${a.macAddress ? esc(a.macAddress) : '<span style="color:var(--ink-faint);">—</span>'}</div></td>
        <td data-label="IMEI" style="font-family:var(--font-mono); font-size:12px;">${(a.imei1 || a.imei2) ? `<div>${esc(a.imei1)}</div><div>${esc(a.imei2)}</div>` : '<div><span style="color:var(--ink-faint);">—</span></div>'}</td>
        <td data-label="Created"><div>${fmtDate(a.createdAt)}</div></td>
        <td data-label="Actions">
          <div class="row-actions">
            <button class="icon-btn" data-action="edit" aria-label="Edit asset" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            <button class="icon-btn danger" data-action="delete" aria-label="Delete asset" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }
}
