import { Modal } from './Modal.js';
import { el, esc } from '../utils/dom.js';
import { fmtLocalDateTime } from '../utils/format.js';
import { renderPagination } from './Pagination.js';

/**
 * User group activity log — a dedicated table view for UserGroupController's
 * "view log", built to match a reference "Operation log" screen (filter row
 * with a plain Search/Reset, a real table with its own header row, and
 * standard pagination) rather than the tabbed timeline components/
 * LogModal.js uses for Gadget/UserAccount history elsewhere in the app.
 *
 * Deliberately its own component instead of a new mode bolted onto
 * LogModal.js: that component's tab-per-entry-type design (All/Transfers/
 * Users/Remarks) is specific to Gadget's history shape and is still exactly
 * right for Gadget/UserAccount — reusing it here would mean either warping
 * it to fit two very different layouts, or adding a "table mode" flag only
 * this one caller would ever set. A second small component is simpler than
 * either.
 *
 * UserGroup.addLogEntry's entries only ever use 4 operation types (see
 * UserGroupController.js): create, update, enable, disable.
 */
const OPERATION_TYPE_LABEL = { create: 'Create', update: 'Edit', enable: 'Enable', disable: 'Disable' };
const OPERATION_TYPE_PILL = { create: 'pill-linked', update: 'pill-cat', enable: 'pill-linked', disable: 'pill-bad' };

/**
 * @param {object} params
 * @param {import('../models/UserGroup.js').UserGroup[]} params.groups - every group, so the log can show activity across all of them at once (matching the reference's un-scoped "Operation log").
 */
export function openUserGroupActivityLogModal({ groups = [] }) {
  const allEntries = groups
    .flatMap((g) => (g.history || []).map((entry) => ({ ...entry, groupName: g.name, groupNumber: g.groupNumber })))
    .sort((a, b) => b.timestamp - a.timestamp);

  let filters = { groupNumber: '', operator: '' };
  let page = 1;
  let pageSize = 20;

  function filteredEntries() {
    return allEntries.filter((e) => {
      if (filters.groupNumber && !(e.groupNumber || '').toLowerCase().includes(filters.groupNumber.toLowerCase())) return false;
      if (filters.operator && !(e.performedBy || '').toLowerCase().includes(filters.operator.toLowerCase())) return false;
      return true;
    });
  }

  const body = el(`
    <div class="uga-log-body">
      <div class="filterbar">
        <div class="filterbar-row">
          <div class="filterbar-col">
            <input type="text" class="uga-filter-groupnumber" placeholder="User group number">
            <input type="text" class="uga-filter-operator" placeholder="User coding">
            <button tabindex="-1" type="button" class="btn btn-accent btn-sm uga-search-btn">Search</button>
            <button tabindex="-1" type="button" class="btn btn-outline btn-sm uga-reset-btn">Reset</button>
          </div>
        </div>
      </div>
      <div class="loc-table-wrap uga-table-wrap">
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
        <div class="loc-footer-left"><span class="uga-total-count"></span></div>
        <div class="grid-footer-right">
          <select class="uga-page-size">
            <option value="20">20/page</option>
            <option value="50">50/page</option>
            <option value="100">100/page</option>
          </select>
          <button tabindex="-1" type="button" class="page-nav uga-prev-page" aria-label="Previous page">‹</button>
          <div class="page-numbers uga-page-numbers"></div>
          <button tabindex="-1" type="button" class="page-nav uga-next-page" aria-label="Next page">›</button>
          <span class="goto-label">Go to</span>
          <input type="number" class="uga-goto-input" min="1" value="1">
          <button tabindex="-1" type="button" class="btn btn-outline btn-sm uga-goto-btn">Go</button>
        </div>
      </div>
    </div>
  `);

  const tbody = body.querySelector('tbody');
  const totalCountEl = body.querySelector('.uga-total-count');

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
          <td data-label="Operation Object"><div>User group</div></td>
          <td data-label="Associated Item"><div>${esc(e.groupName || 'Unknown')}</div></td>
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
        pageSizeSelect: body.querySelector('.uga-page-size'),
        prevPageBtn: body.querySelector('.uga-prev-page'),
        nextPageBtn: body.querySelector('.uga-next-page'),
        pageNumbers: body.querySelector('.uga-page-numbers'),
        gotoPageInput: body.querySelector('.uga-goto-input'),
        gotoPageBtn: body.querySelector('.uga-goto-btn')
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

  body.querySelector('.uga-search-btn').addEventListener('click', () => {
    filters = {
      groupNumber: body.querySelector('.uga-filter-groupnumber').value.trim(),
      operator: body.querySelector('.uga-filter-operator').value.trim()
    };
    page = 1;
    refresh();
  });
  body.querySelector('.uga-reset-btn').addEventListener('click', () => {
    body.querySelector('.uga-filter-groupnumber').value = '';
    body.querySelector('.uga-filter-operator').value = '';
    filters = { groupNumber: '', operator: '' };
    page = 1;
    refresh();
  });

  refresh();

  const modal = new Modal({
    title: 'User group activity log',
    body,
    size: 'lg',
    footer: [{ label: 'Close', variant: 'btn-outline', onClick: (m) => m.close() }]
  });
  modal.open();
  return modal;
}
