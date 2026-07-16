import { el, esc } from '../../utils/dom.js';

/** Builds a <datalist> options string from a list of raw values, deduped and sorted. */
function distinctOptions(values) {
  return [...new Set(values.map((v) => (v || '').trim()).filter(Boolean))].sort();
}

/**
 * Builds the add/edit gadget form as a detached DOM node plus helpers to
 * read its values and display validation errors. Modal just hosts this
 * node — it has no idea what a Gadget is.
 *
 * Warehouse is intentionally NOT editable here — assigning or moving a
 * gadget's warehouse only happens through the Transfer action, so that
 * every warehouse change is captured as a logged transfer event.
 *
 * Category / Serial number / MAC address / Asset tag (default) all pull
 * their suggestions from the Inventory Assets module (the master catalog
 * of known hardware) rather than from Manage's own records, since that's
 * this project's source of truth for what a given physical device is.
 * User pulls suggestions from Manage's own existing records instead,
 * since Inventory Assets has no concept of who something is assigned to.
 * Picking (or typing) a serial number that matches a catalog entry
 * auto-fills MAC address and Asset tag (default) from that entry.
 *
 * @param {object} [gadget] - existing Gadget to prefill, or omit for a blank form.
 * @param {object} [source]
 * @param {string[]} [source.userOptions] - known users from Manage's own records.
 * @param {object[]} [source.inventoryAssets] - InventoryAsset records (category, serialNumber, assetTag, macAddress).
 * @param {Set<string>} [source.usedSerials] - serial numbers (lowercased, trimmed) already assigned to some other Manage record, excluded from suggestions so the dropdown doesn't offer a serial that would just fail the duplicate-serial check.
 */
export function buildManageForm(gadget = null, { userOptions = [], inventoryAssets = [], usedSerials = new Set() } = {}) {
  const node = el(`
    <form class="gadget-form" novalidate>
      <div class="field-row">
        <div class="field">
          <label for="gUser">User</label>
          <input type="text" id="gUser" name="user" list="gadgetUserOptions" placeholder="e.g. Maria Santos">
          <datalist id="gadgetUserOptions"></datalist>
          <div class="field-error" data-error-for="user"></div>
        </div>
        <div class="field">
          <label for="gRole">Role</label>
          <input type="text" id="gRole" name="role" placeholder="e.g. Warehouse Associate">
        </div>
      </div>
      <div class="field">
        <label for="gCategory">Category</label>
        <input type="text" id="gCategory" name="category" list="gadgetCategoryOptions" placeholder="e.g. Laptop">
        <datalist id="gadgetCategoryOptions"></datalist>
        <div class="field-error" data-error-for="category"></div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="gSerial">Serial number</label>
          <input type="text" id="gSerial" name="serialNumber" list="gadgetSerialOptions" placeholder="e.g. SN-88213X">
          <datalist id="gadgetSerialOptions"></datalist>
          <div class="field-error" data-error-for="serialNumber"></div>
        </div>
        <div class="field">
          <label for="gMac">MAC address</label>
          <input type="text" id="gMac" name="macAddress" list="gadgetMacOptions" placeholder="e.g. 3C:22:FB:AA:11:02">
          <datalist id="gadgetMacOptions"></datalist>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="gWhTag">Warehouse asset tag</label>
          <input type="text" id="gWhTag" name="warehouseAssetTag" placeholder="e.g. WH-0091">
        </div>
        <div class="field">
          <label for="gDefTag">Asset tag (default)</label>
          <input type="text" id="gDefTag" name="assetTagDefault" list="gadgetAssetTagOptions" placeholder="Factory / vendor tag">
          <datalist id="gadgetAssetTagOptions"></datalist>
          <div class="field-error" data-error-for="assetTagDefault"></div>
        </div>
      </div>
      <div class="field">
        <label for="gPassword">Password</label>
        <div class="password-field">
          <input type="password" id="gPassword" name="password" placeholder="Device or login password">
          <button type="button" class="password-toggle" data-action="toggle-password" aria-label="Show password">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>
      <div class="field">
        <label for="gRemarks">Remarks</label>
        <input type="text" id="gRemarks" name="remarks" placeholder="Any notes worth flagging">
      </div>
      <div class="field">
        <label for="gDescription">Description</label>
        <textarea id="gDescription" name="description" rows="3" placeholder="Model, condition, accessories included…"></textarea>
      </div>
    </form>
  `);

  // Inventory Assets is the source of truth for these four fields' suggestions.
  node.querySelector('#gadgetCategoryOptions').innerHTML =
    distinctOptions(inventoryAssets.map((a) => a.category)).map((v) => `<option value="${esc(v)}">`).join('');

  // Manage's own records are the source of truth for who's already been assigned something.
  node.querySelector('#gadgetUserOptions').innerHTML =
    distinctOptions(userOptions).map((v) => `<option value="${esc(v)}">`).join('');

  const categoryInput = node.querySelector('#gCategory');
  const serialOptionsEl = node.querySelector('#gadgetSerialOptions');
  const macOptionsEl = node.querySelector('#gadgetMacOptions');
  const assetTagOptionsEl = node.querySelector('#gadgetAssetTagOptions');

  /**
   * Serial/MAC/Asset-tag suggestions are narrowed to whatever category is
   * currently typed, so picking a category first (e.g. "Tablet") means the
   * dropdown only offers serials/tags/MACs that actually belong to tablets
   * in the catalog, instead of every device Inventory Assets has ever seen.
   * With no category typed yet, every catalog entry is offered.
   *
   * Catalog entries whose serial is already assigned to another Manage
   * record are also left out — suggesting one would just walk the user
   * straight into the duplicate-serial validation error.
   */
  function refreshCatalogSuggestions() {
    const currentCategory = categoryInput.value.trim();
    const relevant = inventoryAssets.filter((a) => {
      if (currentCategory && a.category !== currentCategory) return false;
      const serial = (a.serialNumber || '').trim().toLowerCase();
      if (serial && usedSerials.has(serial)) return false;
      return true;
    });

    serialOptionsEl.innerHTML = distinctOptions(relevant.map((a) => a.serialNumber)).map((v) => `<option value="${esc(v)}">`).join('');
    macOptionsEl.innerHTML = distinctOptions(relevant.map((a) => a.macAddress)).map((v) => `<option value="${esc(v)}">`).join('');
    assetTagOptionsEl.innerHTML = distinctOptions(relevant.map((a) => a.assetTag)).map((v) => `<option value="${esc(v)}">`).join('');
  }

  categoryInput.addEventListener('input', refreshCatalogSuggestions);

  // Serial number -> catalog entry, for the auto-fill below. This lookup
  // stays unfiltered by category (unlike the suggestions above) — an exact
  // serial number is unambiguous on its own, so it should resolve correctly
  // even before a category has been typed. Later duplicate serials in the
  // catalog simply overwrite earlier ones here.
  const bySerial = new Map();
  inventoryAssets.forEach((a) => {
    const serial = (a.serialNumber || '').trim();
    if (serial) bySerial.set(serial, a);
  });

  const serialInput = node.querySelector('#gSerial');
  const macInput = node.querySelector('#gMac');
  const assetTagInput = node.querySelector('#gDefTag');
  serialInput.addEventListener('input', () => {
    const match = bySerial.get(serialInput.value.trim());
    if (!match) return;
    macInput.value = match.macAddress || '';
    assetTagInput.value = match.assetTag || '';
  });

  node.querySelector('[data-action="toggle-password"]').addEventListener('click', (e) => {
    const input = node.querySelector('#gPassword');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    e.currentTarget.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });

  if (gadget) {
    node.querySelector('#gUser').value = gadget.user;
    node.querySelector('#gRole').value = gadget.role;
    node.querySelector('#gCategory').value = gadget.category;
    node.querySelector('#gSerial').value = gadget.serialNumber;
    node.querySelector('#gMac').value = gadget.macAddress;
    node.querySelector('#gWhTag').value = gadget.warehouseAssetTag;
    node.querySelector('#gDefTag').value = gadget.assetTagDefault;
    node.querySelector('#gPassword').value = gadget.password;
    node.querySelector('#gRemarks').value = gadget.remarks;
    node.querySelector('#gDescription').value = gadget.description;
  }

  // Populate suggestions once up front — either narrowed to the prefilled
  // edit-mode category, or the full catalog for a blank add-mode form.
  refreshCatalogSuggestions();

  function getData() {
    return {
      user: node.querySelector('#gUser').value.trim(),
      role: node.querySelector('#gRole').value.trim(),
      category: node.querySelector('#gCategory').value.trim(),
      serialNumber: node.querySelector('#gSerial').value.trim(),
      macAddress: node.querySelector('#gMac').value.trim(),
      warehouseAssetTag: node.querySelector('#gWhTag').value.trim(),
      assetTagDefault: node.querySelector('#gDefTag').value.trim(),
      password: node.querySelector('#gPassword').value,
      remarks: node.querySelector('#gRemarks').value.trim(),
      description: node.querySelector('#gDescription').value.trim()
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
    node.querySelector('#gUser')?.focus();
  }

  return { node, getData, showErrors, focusFirst };
}
