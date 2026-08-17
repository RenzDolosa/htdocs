import { el, esc } from '../../utils/dom.js';

/** Formats an epoch-ms timestamp as a yyyy-mm-dd string for an <input type="date">, in local time. */
function toDateInputValue(ms) {
  const d = new Date(ms || Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Turns the Created field's yyyy-mm-dd value back into a stored
 * timestamp, given `baseCreatedAt` — the value the field started at when
 * the form was built (today's exact moment for a new asset, or the
 * existing record's own createdAt for an edit).
 *
 * Only overrides `baseCreatedAt` with a *midnight* timestamp when the
 * chosen date is actually a different calendar day than baseCreatedAt's
 * own — i.e. the person deliberately backdated/corrected it, the one
 * thing a plain <input type="date"> can express. Left as `baseCreatedAt`
 * itself otherwise (same day still selected, or the field is blank/
 * invalid), so the original time-of-day survives.
 *
 * This used to unconditionally reparse the field into local midnight on
 * every save, whether or not the date had actually been touched — every
 * new asset's Created column showed exactly 12:00:00 AM, since the field
 * always starts pre-filled with today's date but a date-only input has
 * no way to carry today's actual time back out.
 */
function resolveCreatedAt(value, baseCreatedAt) {
  if (!value) return baseCreatedAt;
  const [y, m, d] = value.split('-').map(Number);
  const chosen = new Date(y, (m || 1) - 1, d || 1);
  if (Number.isNaN(chosen.getTime())) return baseCreatedAt;
  const base = new Date(baseCreatedAt);
  const sameDay = chosen.getFullYear() === base.getFullYear() && chosen.getMonth() === base.getMonth() && chosen.getDate() === base.getDate();
  return sameDay ? baseCreatedAt : chosen.getTime();
}

/**
 * Builds the add/edit inventory-asset form as a detached DOM node plus
 * helpers to read its values and display validation errors. Modal just
 * hosts this node the same way it hosts ManageForm's.
 *
 * Creation date defaults to today (for a new record) or the record's
 * existing createdAt (when editing), but is an editable field — the
 * user can backdate/correct it, e.g. when entering stock that actually
 * arrived earlier. See InventoryAsset model for how the date string is
 * turned back into a stored timestamp.
 *
 * @param {object} [asset] - existing InventoryAsset to prefill, or omit for a blank form.
 * @param {string[]} [categoryOptions] - known categories, offered via <datalist>.
 * @param {string[]} [lockedFields] - field `name`s to render disabled (grayed out, unfocusable, current value shown but not editable). Driven by InventoryAssetController from the signed-in group's Inventory Assets → Edit field permissions (see models/UserGroup.js's PERMISSION_TREE) when editing an existing asset; left empty for Add.
 */
export function buildInventoryAssetForm(asset = null, categoryOptions = [], lockedFields = []) {
  // Captured once, at build time — see resolveCreatedAt's doc comment
  // for why getData() needs this exact value rather than recomputing
  // Date.now() at save time or re-deriving it from the date field alone.
  const baseCreatedAt = asset ? asset.createdAt : Date.now();
  const node = el(`
    <form class="gadget-form" novalidate>
      <div class="field">
        <label for="iaCategory">Category</label>
        <input type="text" id="iaCategory" name="category" list="inventoryAssetCategoryOptions" placeholder="e.g. Laptop">
        <datalist id="inventoryAssetCategoryOptions"></datalist>
        <div class="field-error" data-error-for="category"></div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="iaSerial">Serial number</label>
          <input type="text" id="iaSerial" name="serialNumber" placeholder="e.g. SN-88213X">
          <div class="field-error" data-error-for="serialNumber"></div>
        </div>
        <div class="field">
          <label for="iaTag">Asset tag</label>
          <input type="text" id="iaTag" name="assetTag" placeholder="e.g. WH-0091">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="iaImei1">IMEI 1 (Optional)</label>
          <input type="text" id="iaImei1" name="imei1" placeholder="e.g. 863813030670519">
        </div>
        <div class="field">
          <label for="iaMac">MAC address</label>
          <input type="text" id="iaMac" name="macAddress" placeholder="e.g. 3C:22:FB:AA:11:02">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="iaImei2">IMEI 2 (Optional)</label>
          <input type="text" id="iaImei2" name="imei2" placeholder="e.g. 863813030966016">
        </div>
        <div class="field">
          <label for="iaCreatedAt">Created</label>
          <input type="date" id="iaCreatedAt" name="createdAt">
          <div class="field-error" data-error-for="createdAt"></div>
        </div>
      </div>
    </form>
  `);

  const categoryList = node.querySelector('#inventoryAssetCategoryOptions');
  categoryList.innerHTML = categoryOptions.map((c) => `<option value="${esc(c)}">`).join('');

  node.querySelector('#iaCreatedAt').value = toDateInputValue(baseCreatedAt);

  if (asset) {
    node.querySelector('#iaCategory').value = asset.category;
    node.querySelector('#iaSerial').value = asset.serialNumber;
    node.querySelector('#iaTag').value = asset.assetTag;
    node.querySelector('#iaImei1').value = asset.imei1;
    node.querySelector('#iaMac').value = asset.macAddress;
    node.querySelector('#iaImei2').value = asset.imei2;
  }

  lockedFields.forEach((name) => {
    const input = node.querySelector(`[name="${name}"]`);
    if (!input) return;
    input.disabled = true;
    input.title = 'You do not have permission to change this field.';
  });

  function getData() {
    return {
      category: node.querySelector('#iaCategory').value.trim(),
      serialNumber: node.querySelector('#iaSerial').value.trim(),
      assetTag: node.querySelector('#iaTag').value.trim(),
      imei1: node.querySelector('#iaImei1').value.trim(),
      macAddress: node.querySelector('#iaMac').value.trim(),
      imei2: node.querySelector('#iaImei2').value.trim(),
      createdAt: resolveCreatedAt(node.querySelector('#iaCreatedAt').value, baseCreatedAt)
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
    node.querySelector('#iaCategory')?.focus();
  }

  return { node, getData, showErrors, focusFirst };
}
