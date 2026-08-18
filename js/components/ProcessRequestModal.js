import { Modal } from './Modal.js';
import { el, esc, qsa } from '../utils/dom.js';
import { generateId } from '../utils/id.js';
import { fmtManifestDate } from '../utils/format.js';
import { getOperatorName } from '../core/Operator.js';
import { Toast } from './Toast.js';
import { confirmDialog } from './ConfirmDialog.js';
import { enhanceSelect } from './SelectField.js';

/**
 * ProcessRequestModal renders a printable "Process Request" document that
 * pairs a set of Manage assets (checked in the grid, same as Preview
 * Manifest's own selection) with a pending Requisition — the in-app
 * equivalent of physically pulling stock to fulfill a request form.
 *
 * Deliberately the *same shape* as ManifestModal, right down to reusing
 * its CSS classes (manifest-doc / manifest-detail-table / manifest-meta-*
 * / .printing-manifest) rather than inventing a parallel look: rows are
 * pre-filled from the selected gadgets but every cell stays editable, a
 * person can hand-add fully blank rows for items not yet in the system,
 * and nothing is written back until Issue / Print's print dialog closes
 * and the person confirms it actually went through (browsers give no way
 * to distinguish "printed/saved" from "hit Cancel" — see ManifestModal's
 * own doc comment for why that confirm step exists).
 *
 * What's different from a Manifest transfer: there's no "Transfer to"
 * merchant/location to resolve — the destination is a *person* (the
 * requisition's requester), not a warehouse location — so applying this
 * always writes `user` directly and clears `merchant`, the same "issued
 * out of stock" shape RequisitionController's own processing used before
 * this moved here. Once applied, the paired Requisition (if any was
 * selected) is marked finished with exactly the asset ids issued.
 */

/** Column order/labels for the detail table — identical set to
 * ManifestModal's own COLUMNS, so the print stylesheet's per-column width
 * rules (css/modal.css's body.printing-manifest nth-child rules) still
 * line up correctly for this document too. */
const COLUMNS = [
  { key: 'user', label: 'User' },
  { key: 'role', label: 'Role' },
  { key: 'category', label: 'Gadget Type' },
  { key: 'serialNumber', label: 'Serial Number' },
  { key: 'warehouseAssetTag', label: 'Warehouse Asset Tag' },
  { key: 'assetTagDefault', label: 'Asset Tag' },
  { key: 'macAddress', label: 'MAC Address' },
  { key: 'password', label: 'Password' },
  { key: 'merchant', label: 'Merchant' },
  { key: 'description', label: 'Description' },
  { key: 'recentResponsible', label: 'Recent Responsible' }
];

function rowFromGadget(g) {
  return {
    rowId: g.id,
    user: g.user || '',
    role: g.role || '',
    category: g.category || '',
    serialNumber: g.serialNumber || '',
    warehouseAssetTag: g.warehouseAssetTag || '',
    assetTagDefault: g.assetTagDefault || '',
    macAddress: g.macAddress || '',
    password: g.password || '',
    merchant: g.merchant || '',
    description: g.description || '',
    recentResponsible: typeof g.getLastResponsible === 'function' ? g.getLastResponsible() : ''
  };
}

function blankRow() {
  const row = { rowId: generateId('prow') };
  COLUMNS.forEach((c) => { row[c.key] = ''; });
  return row;
}

function rowHTML(row) {
  const cells = COLUMNS.map((c) =>
    `<td><input type="text" data-field="${c.key}" value="${esc(row[c.key])}" placeholder="—"></td>`
  ).join('');
  return `
    <tr data-row-id="${esc(row.rowId)}">
      ${cells}
      <td class="manifest-row-remove no-print">
        <button tabindex="-1" type="button" class="icon-btn danger" data-action="remove-pr-row" title="Remove row" aria-label="Remove row">✕</button>
      </td>
    </tr>`;
}

/** Meta fields that must all be filled in before Issue / Print is allowed. */
const REQUIRED_META_KEYS = ['requisitionId', 'preparedBy', 'issuedTo', 'date'];

/**
 * @param {object} opts
 * @param {object[]} opts.gadgets - selected gadgets (checked rows in Manage) to pre-fill as rows.
 * @param {object[]} [opts.requisitions] - every Requisition, used to populate the picker (pending ones only are offered).
 * @param {import('../core/Store.js').Store} [opts.gadgetStore] - the Manage store these gadgets came from. Without it, Issue / Print still prints, it just can't persist anything.
 * @param {import('../core/Store.js').Store} [opts.requisitionStore] - the Requisition store; the paired request is marked finished here once issued.
 * @param {string} [opts.defaultPreparedBy] - pre-fills the Prepared by field.
 */
export function openProcessRequestModal({ gadgets = [], requisitions = [], gadgetStore = null, requisitionStore = null, defaultPreparedBy = '' } = {}) {
  const initialRows = gadgets.length ? gadgets.map(rowFromGadget) : [blankRow()];
  const pendingRequisitions = requisitions.filter((r) => r.status !== 'finished');
  let issueBtn = null;

  const body = el(`
    <div class="manifest-doc">
      <div style="display: grid; grid-template-columns: auto 1fr; gap: 20px; margin-bottom: 8px;">
        <table class="manifest-summary-table">
          <thead><tr><th>Category</th><th>Total</th></tr></thead>
          <tbody data-role="pr-summary-body"></tbody>
        </table>

        <div>
          <div class="manifest-summary-head">
            <div class="manifest-title">REQUEST TRANSMITAL DETAILS</div>
          </div>

          <div class="manifest-meta-grid">
            <div class="manifest-meta-row">
              <label><span class="required-mark">*</span>Prepared by</label>
              <input type="text" data-meta="preparedBy" placeholder="Name of preparer">
            </div>
            <div class="manifest-meta-row">
              <label><span class="required-mark">*</span>Issued to</label>
              <input type="text" data-meta="issuedTo" placeholder="Name of requester">
            </div>
            <div class="manifest-meta-row">
              <label><span class="required-mark">*</span>Requisition</label>
              <select data-meta="requisitionId">
                <option value="" disabled selected>${pendingRequisitions.length ? 'Select a pending request…' : 'No pending requests'}</option>
                ${pendingRequisitions.map((r) => `<option value="${esc(r.id)}">${esc(r.requesterName || 'Unnamed requester')} — ${esc(r.items.map((i) => `${i.category} × ${i.qty}`).join(', ') || 'No items')}</option>`).join('')}
              </select>
            </div>
            <div class="manifest-meta-row">
              <label><span class="required-mark">*</span>Transfer To</label>
              <input type="text" data-meta="purpose" placeholder="Purpose">
            </div>
            <div class="manifest-meta-row manifest-meta-row--signature">
              <label>Signature</label>
              <div class="manifest-signature-line no-print"></div>
            </div>
            <div class="manifest-meta-row">
              <label><span class="required-mark">*</span>Date</label>
              <input type="text" data-meta="date" placeholder="e.g. Tue, Jul 14, 2026">
            </div>
          </div>
        </div>
      </div>

      <div class="manifest-table-wrap">
      <table class="manifest-detail-table">
      <thead>
      <tr>
      ${COLUMNS.map((c) => `<th>${esc(c.label)}</th>`).join('')}
      <th class="no-print"></th>
      </tr>
      </thead>
      <tbody data-role="pr-body"></tbody>
      </table>
      </div>

      <div class="manifest-below-table-row">
        <button tabindex="-1" type="button" class="btn btn-outline btn-sm no-print" data-action="add-pr-row">+ Add row</button>
      </div>
    </div>
  `);

  const tbody = body.querySelector('[data-role="pr-body"]');
  const summaryBody = body.querySelector('[data-role="pr-summary-body"]');

  body.querySelector('[data-meta="preparedBy"]').value = defaultPreparedBy || getOperatorName();
  body.querySelector('[data-meta="date"]').value = fmtManifestDate();

  // Picking a pending request fills in who it's for (and why) straight
  // from the submission — both stay editable afterward, same as every
  // other pre-filled field on this document.
  const requisitionSelect = body.querySelector('[data-meta="requisitionId"]');
  const issuedToInput = body.querySelector('[data-meta="issuedTo"]');
  const purposeInput = body.querySelector('[data-meta="purpose"]');
  enhanceSelect(requisitionSelect);
  requisitionSelect.addEventListener('change', () => {
    const requisition = pendingRequisitions.find((r) => r.id === requisitionSelect.value);
    if (requisition) {
      issuedToInput.value = requisition.requesterName || '';
      purposeInput.value = requisition.purpose || '';
    }
    updateIssueButtonState();
  });

  function isMetaComplete() {
    return REQUIRED_META_KEYS.every((key) => body.querySelector(`[data-meta="${key}"]`).value.trim() !== '');
  }

  function updateIssueButtonState() {
    if (!issueBtn) return;
    const ready = isMetaComplete();
    issueBtn.disabled = !ready;
    issueBtn.title = ready ? '' : 'Select a requisition, then fill in Prepared by, Issued to, and Date first.';
  }

  REQUIRED_META_KEYS.forEach((key) => {
    body.querySelector(`[data-meta="${key}"]`).addEventListener('input', updateIssueButtonState);
  });

  function renderRows(rows) {
    tbody.innerHTML = rows.map(rowHTML).join('');
    bindRowEvents();
    recomputeSummary();
  }

  function recomputeSummary() {
    const counts = new Map();
    qsa('input[data-field="category"]', tbody).forEach((input) => {
      const key = input.value.trim() || 'Unspecified';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const entries = [...counts.entries()];
    const grandTotal = entries.reduce((sum, [, count]) => sum + count, 0);
    const rowsHTML = entries.map(([type, count]) =>
      `<tr><td>${esc(type)}</td><td>${count}</td></tr>`
    ).join('') || '<tr><td colspan="2" style="color:var(--ink-faint);">No rows yet</td></tr>';
    summaryBody.innerHTML = rowsHTML + `<tr class="manifest-summary-grand"><td>Grand Total</td><td>${grandTotal}</td></tr>`;
  }

  function bindRowEvents() {
    qsa('tr[data-row-id]', tbody).forEach((tr) => {
      const removeBtn = tr.querySelector('[data-action="remove-pr-row"]');
      removeBtn.addEventListener('click', () => {
        tr.remove();
        recomputeSummary();
      });
      const categoryInput = tr.querySelector('input[data-field="category"]');
      categoryInput.addEventListener('input', () => recomputeSummary());
    });
  }

  renderRows(initialRows);

  body.querySelector('[data-action="add-pr-row"]').addEventListener('click', () => {
    tbody.insertAdjacentHTML('beforeend', rowHTML(blankRow()));
    bindRowEvents();
    recomputeSummary();
    const lastInput = tbody.querySelector('tr:last-child input');
    lastInput?.focus();
  });

  function addLandscapePage() {
    removeLandscapePage();
    const style = document.createElement('style');
    style.id = 'processRequestLandscapePage';
    style.textContent = '@page{ size: landscape; margin: 12mm; }';
    document.head.appendChild(style);
  }

  function removeLandscapePage() {
    document.getElementById('processRequestLandscapePage')?.remove();
  }

  /**
   * Issues every row that maps back to a real Gadget (hand-added blank
   * rows have no matching id and are skipped, same as ManifestModal's own
   * applyMerchantTransfer): `user` becomes "Issued to", `merchant` is
   * cleared — the same field the rest of the app already treats as "sits
   * at a stock room" (see RequisitionController's own
   * _computeAvailableByCategory), so an issued gadget stops counting as
   * available the moment it's issued. Logs the move on the gadget, then
   * marks the paired Requisition finished with exactly the ids issued
   * here, mirroring what "Process request" used to do automatically
   * before this moved to Manage.
   */
  function applyIssuance() {
    if (!gadgetStore) return;
    const requisitionId = requisitionSelect.value;
    const issuedTo = issuedToInput.value.trim();
    const purpose = purposeInput.value.trim();
    if (!issuedTo) return;

    const requestedBy = getOperatorName();
    const issuedIds = [];

    qsa('tr[data-row-id]', tbody).forEach((tr) => {
      const rowId = tr.getAttribute('data-row-id');
      const gadget = gadgetStore.get(rowId);
      if (!gadget) return;

      const previousMerchant = gadget.merchant || '';
      gadget.addLogEntry(
        `Issued via requisition to ${issuedTo}${purpose ? ` (${purpose})` : ''}.`,
        'transfer',
        { from: previousMerchant, to: '' },
        requestedBy
      );
      gadgetStore.update(gadget.id, { user: issuedTo, merchant: '' });
      issuedIds.push(gadget.id);

      // Reflect the post-issuance values in the printed rows themselves,
      // same as ManifestModal does for its own transferred merchant.
      const userInput = tr.querySelector('input[data-field="user"]');
      if (userInput) userInput.value = issuedTo;
      const merchantInput = tr.querySelector('input[data-field="merchant"]');
      if (merchantInput) merchantInput.value = '';
    });

    if (issuedIds.length === 0) {
      Toast.error('None of the rows above matched a real asset to issue.');
      return;
    }

    if (requisitionStore && requisitionId) {
      requisitionStore.update(requisitionId, { status: 'finished', fulfilledGadgetIds: issuedIds });
    }

    Toast.success(`Processed the request for ${issuedTo} — ${issuedIds.length} item${issuedIds.length === 1 ? '' : 's'} issued.`);
  }

  const modal = new Modal({
    title: 'Process Request',
    body,
    size: 'lg',
    footer: [
      { label: 'Close', variant: 'btn-outline', onClick: (m) => m.close() },
      {
        label: 'Issue / Print',
        variant: 'btn-accent',
        onClick: () => {
          if (!isMetaComplete()) return; // belt-and-suspenders — the button is disabled anyway
          addLandscapePage();
          document.body.classList.add('printing-manifest');
          window.addEventListener('afterprint', async () => {
            document.body.classList.remove('printing-manifest');
            removeLandscapePage();

            const confirmed = await confirmDialog({
              title: 'Confirm issuance',
              message: `Did the request finish printing or saving? Confirming will issue the assets above to ${esc(issuedToInput.value.trim() || 'the requester')} and mark the requisition finished.`,
              confirmLabel: 'Yes, issue',
              cancelLabel: 'No, skip'
            });
            if (confirmed) applyIssuance();
          }, { once: true });
          window.print();
        }
      }
    ],
    onClose: () => { removeLandscapePage(); }
  });

  issueBtn = modal.footEl.querySelector('.btn-accent');
  updateIssueButtonState();

  modal.open();
  return modal;
}
