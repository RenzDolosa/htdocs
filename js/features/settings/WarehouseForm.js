import { el } from '../../utils/dom.js';

const CURRENCIES = [
  { value: 'PHP', label: 'Philippine peso' },
  { value: 'USD', label: 'US dollar' },
  { value: 'CNY', label: 'Chinese yuan' }
];

/**
 * Builds the "Warehouse details" form (right pane of Warehouse Information)
 * as a detached DOM node, mirroring buildInventoryAssetForm's shape:
 * { node, getData, showErrors, focusFirst }. `warehouse` is always present
 * here (unlike the add/edit modals elsewhere) since this form only shows
 * once a warehouse is selected or just created in the tree.
 */
export function buildWarehouseForm(warehouse) {
  const node = el(`
    <form class="gadget-form warehouse-detail-form" novalidate>
      <div class="field-row field-row--3">
        <div class="field">
          <label for="whName">Warehouse name <span class="required-mark">*</span></label>
          <input type="text" id="whName" name="name" placeholder="e.g. Main Warehouse">
          <div class="field-error" data-error-for="name"></div>
        </div>
        <div class="field">
          <label for="whOperationMode">Warehouse Type</label>
          <select id="whOperationMode" name="operationMode">
            <option value="self-operate">Self-operate warehouse</option>
            <option value="third-party">Third-party warehouse</option>
          </select>
        </div>
        <div class="field">
          <label for="whCode">Warehouse ID</label>
          <input type="text" id="whCode" name="warehouseCode" disabled>
        </div>
      </div>

      <div class="field-row field-row--3">
        <div class="field">
          <label for="whCurrency">Warehouse currency</label>
          <select id="whCurrency" name="currency"></select>
        </div>
        <div class="field">
          <label for="whShortName">Warehouse short name</label>
          <input type="text" id="whShortName" name="shortName" placeholder="e.g. main">
        </div>
        <div class="field">
          <label for="whZip">Zip Code</label>
          <input type="text" id="whZip" name="zipCode" placeholder="e.g. 1114">
        </div>
      </div>

      <div class="field-row field-row--3">
        <div class="field">
          <label for="whCountry">Country</label>
          <input type="text" id="whCountry" name="country" placeholder="Philippines">
        </div>
        <div class="field">
          <label for="whRegion">Region / Province</label>
          <input type="text" id="whRegion" name="region" placeholder="e.g. Metro Manila">
        </div>
        <div class="field">
          <label for="whCity">City / Municipality</label>
          <input type="text" id="whCity" name="city" placeholder="e.g. Quezon City">
        </div>
      </div>

      <div class="field">
        <label for="whFullAddress">Full Address <span class="required-mark">*</span></label>
        <input type="text" id="whFullAddress" name="fullAddress" placeholder="Street, building, area">
        <div class="field-error" data-error-for="fullAddress"></div>
      </div>

      <div class="field-row">
        <div class="field">
          <label for="whContact">Contact person <span class="required-mark">*</span></label>
          <input type="text" id="whContact" name="contactPerson" placeholder="e.g. Juan Dela Cruz">
          <div class="field-error" data-error-for="contactPerson"></div>
          <label class="checkbox-inline"><input type="checkbox" id="whPublicHome" name="publicHomePage"> Public home page / shop name</label>
        </div>
        <div class="field">
          <label for="whPhone">Phone number <span class="required-mark">*</span></label>
          <input type="text" id="whPhone" name="phoneNumber" placeholder="e.g. 09175132562">
          <div class="field-error" data-error-for="phoneNumber"></div>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label for="whMail">Mail</label>
          <input type="text" id="whMail" name="email" placeholder="e.g. warehouse@company.com">
        </div>
        <div class="field">
          <label for="whAreaPriority">Area Priority</label>
          <input type="text" id="whAreaPriority" name="areaPriority" placeholder="Use ',' to separate">
        </div>
      </div>
    </form>
  `);

  const currencySelect = node.querySelector('#whCurrency');
  currencySelect.innerHTML = CURRENCIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join('');

  node.querySelector('#whName').value = warehouse.name;
  node.querySelector('#whOperationMode').value = warehouse.operationMode;
  node.querySelector('#whCode').value = warehouse.warehouseCode;
  node.querySelector('#whCurrency').value = warehouse.currency;
  node.querySelector('#whShortName').value = warehouse.shortName;
  node.querySelector('#whZip').value = warehouse.zipCode;
  node.querySelector('#whCountry').value = warehouse.country;
  node.querySelector('#whRegion').value = warehouse.region;
  node.querySelector('#whCity').value = warehouse.city;
  node.querySelector('#whFullAddress').value = warehouse.fullAddress;
  node.querySelector('#whContact').value = warehouse.contactPerson;
  node.querySelector('#whPublicHome').checked = warehouse.publicHomePage;
  node.querySelector('#whPhone').value = warehouse.phoneNumber;
  node.querySelector('#whMail').value = warehouse.email;
  node.querySelector('#whAreaPriority').value = warehouse.areaPriority;

  function getData() {
    return {
      name: node.querySelector('#whName').value.trim(),
      operationMode: node.querySelector('#whOperationMode').value,
      currency: node.querySelector('#whCurrency').value,
      shortName: node.querySelector('#whShortName').value.trim(),
      zipCode: node.querySelector('#whZip').value.trim(),
      country: node.querySelector('#whCountry').value.trim(),
      region: node.querySelector('#whRegion').value.trim(),
      city: node.querySelector('#whCity').value.trim(),
      fullAddress: node.querySelector('#whFullAddress').value.trim(),
      contactPerson: node.querySelector('#whContact').value.trim(),
      publicHomePage: node.querySelector('#whPublicHome').checked,
      phoneNumber: node.querySelector('#whPhone').value.trim(),
      email: node.querySelector('#whMail').value.trim(),
      areaPriority: node.querySelector('#whAreaPriority').value.trim()
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
    node.querySelector('#whName')?.focus();
  }

  return { node, getData, showErrors, focusFirst };
}
