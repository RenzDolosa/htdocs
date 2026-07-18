import { esc } from '../../utils/dom.js';
import { fmtInt, fmtDate } from '../../utils/format.js';
import { renderPagination } from '../../components/Pagination.js';

/**
 * UserAccountView owns DOM rendering only, same split as ManageView /
 * InventoryAssetView — it receives plain data and a table of callbacks
 * and never touches the Store directly.
 */
export class UserAccountView {
  constructor(refs) {
    this.refs = refs;
  }

  renderTable(users, handlers) {
    const { tableBody, emptyState } = this.refs;
    tableBody.innerHTML = '';

    if (users.length === 0) {
      emptyState.style.display = '';
      return;
    }
    emptyState.style.display = 'none';

    users.forEach((u, i) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td data-label="SN" class="sn-col"><div style="display: flex; justify-content: center; padding: 0;">${i + 1}</div></td>
        <td data-label="User Number"><div>${esc(u.userNumber)}</div></td>
        <td data-label="Username"><div class="um-username-cell">${esc(u.username)}</div></td>
        <td data-label="Login Account"><div>${esc(u.loginAccount)}</div></td>
        <td data-label="User Group"><div>${esc(u.userGroup) || '<span class="muted">—</span>'}</div></td>
        <td data-label="Mail"><div>${esc(u.mail) || '<span class="muted">—</span>'}</div></td>
        <td data-label="Phone Number"><div>${esc(u.phoneNumber) || '<span class="muted">—</span>'}</div></td>
        <td data-label="Enable"><div><input type="checkbox" class="um-enable-toggle" ${u.enabled ? 'checked' : ''}></div></td>
        <td data-label="Created"><div>${esc(fmtDate(u.createdAt))}</div></td>
        <td data-label="Updated"><div>${esc(fmtDate(u.updatedAt))}</div></td>
        <td data-label="Last Login"><div>${u.lastLoginAt ? esc(fmtDate(u.lastLoginAt)) : '<span class="muted">—</span>'}</div></td>
        <td data-label="Actions" class="um-operate-cell">
          <div class="row-actions">
            <button type="button" class="icon-btn um-edit-btn" title="Edit" aria-label="Edit user">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
          </div>
        </td>
      `;
      row.querySelector('.um-enable-toggle').addEventListener('change', (e) => handlers.onToggleEnabled(u.id, e.target.checked));
      row.querySelector('.um-edit-btn').addEventListener('click', () => handlers.onEdit(u.id));
      tableBody.appendChild(row);
    });
  }

  /** @param {object} info - { totalItems, page, pageSize, totalPages } */
  renderFooter(info, handlers) {
    const { totalItems, page, pageSize, totalPages } = info;

    this.refs.resultCount.textContent = `${fmtInt(totalItems)} ${totalItems === 1 ? 'user' : 'users'}`;

    renderPagination(this.refs, { page, pageSize, totalPages }, handlers);
  }
}
