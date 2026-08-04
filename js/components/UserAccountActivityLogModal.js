import { Modal } from './Modal.js';
import { el, esc } from '../utils/dom.js';
import { fmtLocalDateTime } from '../utils/format.js';
import { renderPagination } from './Pagination.js';

/**
 * User account activity log — UserAccountController's "view log" sibling
 * to UserGroupActivityLogModal.js, built the same way and for the same
 * reason: matching a reference "Operation log" screen (plain Search/Reset
 * filter row, a real table with its own header row, standard pagination)
 * rather than LogModal.js's tabbed timeline. See that file's own doc
 * comment for why this is a second small component instead of a shared
 * one — the same reasoning applies here.
 *
 * UserAccount.addLogEntry's entries only ever use the same 4 operation
 * types as UserGroup (see UserAccountController.js): create, update,
 * enable, disable.
 */
const OPERATION_TYPE_LABEL = { create: 'Create', update: 'Edit', enable: 'Enable', disable: 'Disable' };
const OPERATION_TYPE_PILL = { create: 'pill-linked', update: 'pill-cat', enable: 'pill-linked', disable: 'pill-bad' };

/**
 * @param {object} params
 * @param {import('../models/UserAccount.js').UserAccount[]} params.accounts - every account, so the log can show activity across all of them at once (matching the reference's un-scoped "Operation log").
 */
export function openUserAccountActivityLogModal({ accounts = [] }) {
  const allEntries = accounts
    .flatMap((u) => (u.history || []).map((entry) => ({ ...entry, username: u.username, userNumber: u.userNumber })))
    .sort((a, b) => b.timestamp - a.timestamp);

  let filters = { userNumber: '', operator: '' };
  let page = 1;
  let pageSize = 20;

  function filteredEntries() {
    return allEntries.filter((e) => {
      if (filters.userNumber && !(e.userNumber || '').toLowerCase().includes(filters.userNumber.toLowerCase())) return false;
      if (filters.operator && !(e.performedBy || '').toLowerCase().includes(filters.operator.toLowerCase())) return false;
      return true;
    });
  }

  const body = el(`
    <div class="uaa-log-body">
      <div class="filterbar">
        <div class="filterbar-row">
          <div class="filterbar-col">
            <input type="text" class="uaa-filter-usernumber" placeholder="User number">
            <input type="text" class="uaa-filter-operator" placeholder="User coding">
            <button tabindex="-1" type="button" class="btn btn-accent btn-sm uaa-search-btn">Search</button>
            <button tabindex="-1" type="button" class="btn btn-outline btn-sm uaa-reset-btn">Reset</button>
          </div>
        </div>
      </div>
      <div class="loc-table-wrap uaa-table-wrap">
        <table>
          <thead>
            <tr>
              <th data-label="SN" class="sn-col"><div></div></th>
              <th data-label="Operation Object"><div>Operation Object</div></th>
              <th data-label="Associated Item"><div>Associated Item</div></th>
              <th data-label="Operation Type"><div>Operation Type</div></th>
              <th data-label="Operation Content"><div>Operation Content</div></th>
              <th data-label="Operating Time"><div>Operating Time</div></th>
              <th data-label="Operator"><div>Operator</div></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="loc-table-footer">
        <div class="loc-footer-left"><span class="uaa-total-count"></span></div>
        <div class="grid-footer-right">
          <select class="uaa-page-size">
            <option value="20">20/page</option>
            <option value="50">50/page</option>
            <option value="100">100/page</option>
          </select>
          <button tabindex="-1" type="button" class="page-nav uaa-prev-page" aria-label="Previous page">‹</button>
          <div class="page-numbers uaa-page-numbers"></div>
          <button tabindex="-1" type="button" class="page-nav uaa-next-page" aria-label="Next page">›</button>
          <span class="goto-label">Go to</span>
          <input type="number" class="uaa-goto-input" min="1" value="1">
          <button tabindex="-1" type="button" class="btn btn-outline btn-sm uaa-goto-btn">Go</button>
        </div>
      </div>
    </div>
  `);

  const tbody = body.querySelector('tbody');
  const totalCountEl = body.querySelector('.uaa-total-count');

  function refresh() {
    const rows = filteredEntries();
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    const start = (page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);

    tbody.innerHTML = pageRows.length
      ? pageRows.map((e, i) => `
        <tr>
          <td data-label="SN"><div>${start + i + 1}</div></td>
          <td data-label="Operation Object"><div>User</div></td>
          <td data-label="Associated Item"><div>${esc(e.username || 'Unknown')}</div></td>
          <td data-label="Operation Type"><div><span class="pill ${OPERATION_TYPE_PILL[e.type] || 'pill-cat'}">${esc(OPERATION_TYPE_LABEL[e.type] || 'Edit')}</span></div></td>
          <td data-label="Operation Content"><div>${esc(e.message)}</div></td>
          <td data-label="Operating Time"><div>${esc(fmtLocalDateTime(e.timestamp))}</div></td>
          <td data-label="Operator"><div>${esc(e.performedBy || 'Unknown')}</div></td>
        </tr>
      `).join('')
      : `<tr><td colspan="7" class="genpos-empty-row">No activity matches these filters.</td></tr>`;

    totalCountEl.textContent = `Total ${rows.length}`;

    renderPagination(
      {
        pageSizeSelect: body.querySelector('.uaa-page-size'),
        prevPageBtn: body.querySelector('.uaa-prev-page'),
        nextPageBtn: body.querySelector('.uaa-next-page'),
        pageNumbers: body.querySelector('.uaa-page-numbers'),
        gotoPageInput: body.querySelector('.uaa-goto-input'),
        gotoPageBtn: body.querySelector('.uaa-goto-btn')
      },
      { page, pageSize, totalPages },
      {
        onPageSizeChange: (size) => { pageSize = size; page = 1; refresh(); },
        onPrevPage: () => { page -= 1; refresh(); },
        onNextPage: () => { page += 1; refresh(); },
        onPageClick: (p) => { page = p; refresh(); },
        onGotoPage: (p) => { page = p; refresh(); }
      }
    );
  }

  body.querySelector('.uaa-search-btn').addEventListener('click', () => {
    filters = {
      userNumber: body.querySelector('.uaa-filter-usernumber').value.trim(),
      operator: body.querySelector('.uaa-filter-operator').value.trim()
    };
    page = 1;
    refresh();
  });
  body.querySelector('.uaa-reset-btn').addEventListener('click', () => {
    body.querySelector('.uaa-filter-usernumber').value = '';
    body.querySelector('.uaa-filter-operator').value = '';
    filters = { userNumber: '', operator: '' };
    page = 1;
    refresh();
  });

  refresh();

  const modal = new Modal({
    title: 'User management activity log',
    body,
    size: 'lg',
    footer: [{ label: 'Close', variant: 'btn-outline', onClick: (m) => m.close() }]
  });
  modal.open();
  return modal;
}
