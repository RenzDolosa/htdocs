import { Requisition, REQUISITION_APPROVERS } from '../../models/Requisition.js';
import { Toast } from '../../components/Toast.js';
import { getOperatorName } from '../../core/Operator.js';
import { esc } from '../../utils/dom.js';
import { fmtLocalDateTime } from '../../utils/format.js';

/**
 * RequisitionController owns the Requisition Form tab: an in-app clone of
 * the reference "Operation Gadget Request Form" Google Form (see the
 * FORM-vs-Print-Preview reference screenshots this was built from).
 *
 * Item rows (Gadget Type + Qty, addable/removable via "+ Add row") are
 * managed directly here rather than through RequisitionView, since
 * they're transient in-progress form state, not something derived from
 * the store — see RequisitionView's own header comment for why a full
 * re-render would be wrong for these specifically.
 *
 * Printing reuses the same body-class + `@media print` technique as
 * ManifestModal (see css/modal.css's `.printing-manifest` rules and this
 * feature's own `.printing-requisition` rules in css/requisition.css): a
 * dedicated `#requisitionPrintArea` element — a direct child of <body>,
 * so it's unaffected by which tab panel is currently hidden — gets built
 * fresh from the submitted values right before `window.print()` runs, so
 * the printed page only ever shows what's actually filled in, same as
 * the reference's own Print Preview.
 *
 * Unlike a Manifest transfer, submitting a requisition doesn't change any
 * other record's state, so — unlike ManifestModal's afterprint
 * confirmation dialog — this saves the record immediately on Submit and
 * prints as a courtesy alongside that, rather than gating the save on
 * whether printing actually went through.
 */
export class RequisitionController {
  constructor({ store, inventoryAssetStore, view, refs }) {
    this.store = store;
    this.inventoryAssetStore = inventoryAssetStore;
    this.view = view;
    this.refs = refs;
    this._rowSeq = 0;
  }

  init() {
    this.view.renderApprovers();
    this._refreshCategoryOptions();
    this._addItemRow();

    this.refs.addRowBtn?.addEventListener('click', () => this._addItemRow());
    this.refs.formEl?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._submit();
    });
    this.refs.clearBtn?.addEventListener('click', () => this._resetForm());
    this.refs.historyListEl?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="reprint"]');
      if (!btn) return;
      const requisition = this.store.get(btn.dataset.id);
      if (requisition) this._print(requisition);
    });

    this.store.on('change', () => this._renderHistory());
    // Inventory Assets is the "suggest from Inventory" source for Gadget
    // Type — its own catalog changing (an asset added/edited/imported
    // under a new category) should widen the suggestion list without
    // needing this tab to be reopened.
    this.inventoryAssetStore?.on('change', () => this._refreshCategoryOptions());

    this._renderHistory();
  }

  _refreshCategoryOptions() {
    const categories = this.inventoryAssetStore
      ? [...new Set(this.inventoryAssetStore.list().map((a) => a.category).filter(Boolean))].sort()
      : [];
    this.view.renderCategoryOptions(categories);
  }

  _renderHistory() {
    const requisitions = [...this.store.list()].sort((a, b) => b.createdAt - a.createdAt);
    this.view.renderHistory(requisitions);
  }

  /**
   * Appends one Gadget Type + Qty row, suggested from Inventory Assets'
   * categories via the shared `#requisitionCategoryOptions` datalist
   * (RequisitionView.renderCategoryOptions) — a row shows only the one
   * category picked for it, and "+ Add row" is how another gets added,
   * matching the reference's own FORM view.
   *
   * `rowId` only keys the DOM node while rows are being added/removed —
   * it's never read back out or persisted.
   */
  _addItemRow() {
    if (!this.refs.itemsEl) return;
    const rowId = `row-${++this._rowSeq}`;
    const row = document.createElement('div');
    row.className = 'requisition-item-row';
    row.dataset.rowId = rowId;
    row.innerHTML = `
      <input type="text" class="req-item-category" list="requisitionCategoryOptions" placeholder="Gadget type" data-role="category" autocomplete="off">
      <input type="number" class="req-item-qty" min="1" step="1" placeholder="Qty" data-role="qty">
      <button tabindex="-1" type="button" class="req-item-remove" data-action="remove-row" aria-label="Remove row">&times;</button>
    `;
    row.querySelector('[data-action="remove-row"]').addEventListener('click', () => {
      // Always leave at least one row on screen — a form with zero rows
      // reads as broken, not as "nothing selected yet"; clearing the one
      // remaining row's values is the equivalent action.
      if (this.refs.itemsEl.children.length <= 1) {
        row.querySelector('[data-role="category"]').value = '';
        row.querySelector('[data-role="qty"]').value = '';
        return;
      }
      row.remove();
    });
    this.refs.itemsEl.appendChild(row);
  }

  _collectItems() {
    if (!this.refs.itemsEl) return [];
    return Array.from(this.refs.itemsEl.querySelectorAll('.requisition-item-row')).map((row) => ({
      category: row.querySelector('[data-role="category"]').value.trim(),
      qty: Number(row.querySelector('[data-role="qty"]').value) || 0
    }));
  }

  _showErrors(errors) {
    this.refs.formEl?.querySelectorAll('.field-error').forEach((node) => { node.textContent = ''; });
    Object.entries(errors).forEach(([field, message]) => {
      const node = this.refs.formEl?.querySelector(`[data-error-for="${field}"]`);
      if (node) node.textContent = message;
    });
  }

  _submit() {
    const raw = {
      email: this.refs.emailInput?.value.trim() || '',
      requesterName: this.refs.requesterNameInput?.value.trim() || '',
      items: this._collectItems(),
      purpose: this.refs.purposeInput?.value.trim() || ''
    };

    const { valid, errors } = Requisition.validate(raw);
    if (!valid) {
      this._showErrors(errors);
      Toast.error('Fill in the required fields before submitting.');
      return;
    }
    this._showErrors({});

    const requisition = new Requisition({
      ...raw,
      items: raw.items.filter((i) => i.category && i.qty > 0),
      submittedBy: getOperatorName()
    });
    this.store.create(requisition);
    Toast.success(`Requisition submitted for ${requisition.requesterName}.`);

    this._print(requisition);
    this._resetForm();
  }

  _resetForm() {
    this.refs.formEl?.reset();
    if (this.refs.itemsEl) this.refs.itemsEl.innerHTML = '';
    this._addItemRow();
    this._showErrors({});
  }

  /**
   * Builds the print-only summary into #requisitionPrintArea — same
   * "only what's filled in shows up" shape as the reference's own Print
   * Preview (no Email-checkbox instructional text, no blank/unused rows)
   * — then runs it through window.print(). Reusable for both a fresh
   * Submit and reprinting an older entry from Recent Requisitions.
   */
  _print(requisition) {
    const printArea = document.getElementById('requisitionPrintArea');
    if (!printArea) return;

    const itemsRows = requisition.items.map((i) => `
      <tr><td>${esc(i.category)}</td><td>${esc(String(i.qty))}</td></tr>
    `).join('');

    printArea.innerHTML = `
      <div class="req-print-bar"></div>
      <div class="req-print-body">
        <h1 class="req-print-title">Requisition Form</h1>
        <p class="req-print-subtitle">Operation Gadget Request Form</p>
        <div class="req-print-field"><span class="req-print-label">Requester Name</span><span class="req-print-value">${esc(requisition.requesterName)}</span></div>
        <div class="req-print-field"><span class="req-print-label">Email</span><span class="req-print-value">${esc(requisition.email)}</span></div>
        <table class="req-print-table">
          <thead><tr><th>Gadget Type</th><th>Quantity</th></tr></thead>
          <tbody>${itemsRows}</tbody>
        </table>
        <div class="req-print-field req-print-field--block"><span class="req-print-label">Purpose</span><p class="req-print-value">${esc(requisition.purpose)}</p></div>
        <div class="req-print-approved">
          <span class="req-print-label">Approved by</span>
          <p class="requisition-hint">Signature below…</p>
          <div class="requisition-approvers">
            ${REQUISITION_APPROVERS.map((name) => `
              <div class="requisition-approver">
                <span class="requisition-approver-name">${esc(name)}</span>
                <span class="requisition-approver-line"></span>
              </div>
            `).join('')}
          </div>
        </div>
        <p class="req-print-footer">Submitted ${esc(fmtLocalDateTime(requisition.createdAt))}${requisition.submittedBy ? ` · By ${esc(requisition.submittedBy)}` : ''}</p>
      </div>
    `;

    document.body.classList.add('printing-requisition');
    window.addEventListener('afterprint', () => {
      document.body.classList.remove('printing-requisition');
      printArea.innerHTML = '';
    }, { once: true });
    window.print();
  }
}
