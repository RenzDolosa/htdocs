import { esc } from '../../utils/dom.js';
import { fmtInt, fmtDate } from '../../utils/format.js';
import { renderPagination } from '../../components/Pagination.js';

/**
 * UserGroupView owns DOM rendering only, same split as UserAccountView —
 * it receives plain data (each row already carries a resolved
 * `boundUsernames` array from the controller; this view doesn't know
 * about UserAccount at all) and never touches a Store directly.
 */
export class UserGroupView {
  constructor(refs) {
    this.refs = refs;
  }

  renderTable(groups, handlers) {
    const { tableBody, emptyState } = this.refs;
    tableBody.innerHTML = '';

    if (groups.length === 0) {
      emptyState.style.display = '';
      return;
    }
    emptyState.style.display = 'none';

    groups.forEach((g, i) => {
      const boundLabel = g.boundUsernames.length ? esc(g.boundUsernames.join(', ')) : '<span class="muted">—</span>';
      const warehouseLabel = g.boundWarehouseNames?.length
        ? esc(g.boundWarehouseNames.join(', '))
        : '<span class="muted">All</span>';
      const row = document.createElement('tr');
      row.innerHTML = `
        <td data-label="SN" class="sn-col"><div style="display: flex; justify-content: center; padding: 0;">${i + 1}</div></td>
        <td data-label="User Group Number"><div>${esc(g.groupNumber)}</div></td>
        <td data-label="User Group Name"><div class="um-username-cell um-username-clickable">${esc(g.name)}</div></td>
        <td data-label="Enable"><div><input type="checkbox" class="ug-enable-toggle" ${g.enabled ? 'checked' : ''}></div></td>
        <td data-label="Bound User"><div>${boundLabel}</div></td>
        <td data-label="Bound Warehouse"><div>${warehouseLabel}</div></td>
        <td data-label="Created"><div>${esc(fmtDate(g.createdAt))}</div></td>
        <td data-label="Updated"><div>${esc(fmtDate(g.updatedAt))}</div></td>
        <td data-label="Actions" class="um-operate-cell">
          <div class="row-actions">
            <button tabindex="-1" type="button" class="icon-btn ug-edit-btn" title="Edit" aria-label="Edit user group">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
          </div>
        </td>
      `;
      row.querySelector('.ug-enable-toggle').addEventListener('change', (e) => handlers.onToggleEnabled(g.id, e.target.checked));
      row.querySelector('.ug-edit-btn').addEventListener('click', () => handlers.onEdit(g.id));
      const usernameCell = row.querySelector('.um-username-clickable');
      usernameCell.addEventListener('click', () => handlers.onEdit(g.id));
      usernameCell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlers.onEdit(g.id); }
      });
      tableBody.appendChild(row);
    });
  }

  /** @param {object} info - { totalItems, page, pageSize, totalPages } */
  renderFooter(info, handlers) {
    const { totalItems, page, pageSize, totalPages } = info;
    this.refs.resultCount.textContent = `${fmtInt(totalItems)} ${totalItems === 1 ? 'user group' : 'user groups'}`;
    renderPagination(this.refs, { page, pageSize, totalPages }, handlers);
  }
}
