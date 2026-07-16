import { el, esc } from '../utils/dom.js';

/**
 * Builds the transfer form: shows the current warehouse (read-only) and
 * lets the user pick/type a destination. Kept separate from GadgetForm
 * since it's a distinct, smaller action with its own validation.
 *
 * @param {object} gadget - the gadget being transferred.
 * @param {string[]} [warehouseOptions] - known warehouses, offered via <datalist>.
 */
export function buildTransferForm(gadget, warehouseOptions = []) {
  const otherWarehouses = warehouseOptions.filter((w) => w !== gadget.warehouse);

  const node = el(`
    <form class="transfer-form" novalidate>
      <div class="field">
        <label>Current warehouse</label>
        <div class="transfer-current">${esc(gadget.warehouse || '—')}</div>
      </div>
      <div class="field">
        <label for="tWarehouse">Transfer to warehouse</label>
        <input type="text" id="tWarehouse" name="toWarehouse" list="transferWarehouseOptions" placeholder="e.g. North Annex Warehouse">
        <datalist id="transferWarehouseOptions"></datalist>
        <div class="field-error" data-error-for="toWarehouse"></div>
      </div>
      <div class="field">
        <label for="tNote">Note (optional)</label>
        <input type="text" id="tNote" name="note" placeholder="Reason for transfer">
      </div>
    </form>
  `);

  node.querySelector('#transferWarehouseOptions').innerHTML =
    otherWarehouses.map((w) => `<option value="${esc(w)}">`).join('');

  function getData() {
    return {
      toWarehouse: node.querySelector('#tWarehouse').value.trim(),
      note: node.querySelector('#tNote').value.trim()
    };
  }

  function showErrors(errors) {
    node.querySelectorAll('[data-error-for]').forEach((n) => { n.textContent = ''; });
    node.querySelectorAll('input.invalid').forEach((n) => n.classList.remove('invalid'));
    Object.entries(errors).forEach(([field, message]) => {
      const errorEl = node.querySelector(`[data-error-for="${field}"]`);
      if (errorEl) errorEl.textContent = message;
      const input = node.querySelector(`[name="${field}"]`);
      input?.classList.add('invalid');
    });
  }

  function focusFirst() {
    node.querySelector('#tWarehouse')?.focus();
  }

  return { node, getData, showErrors, focusFirst };
}