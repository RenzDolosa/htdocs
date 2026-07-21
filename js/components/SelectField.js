import { el } from '../utils/dom.js';
import { openDropdownMenu } from './DropdownMenu.js';

/**
 * The one reusable replacement for every native <select> in the app (see
 * also FilterDropdown.js, for filter-bar selects built from scratch rather
 * than an existing <select> element — same visual component underneath,
 * different entry point for a different situation).
 *
 * Rather than reimplementing every screen's filter/read/populate logic
 * against a new custom API, this wraps the *existing* <select> in place:
 * the <select> itself stays in the DOM, fully functional and hidden, so
 * every other module keeps working exactly as before —
 * `selectEl.value`, `selectEl.addEventListener('change', ...)`,
 * `selectEl.innerHTML = '<option>...'`, native form serialization — all of
 * it. Only the *visible* control is swapped for a styled trigger + the
 * same DropdownMenu popover used everywhere else in the app.
 *
 * Usage:
 *   enhanceSelect(document.getElementById('filterCategory'));
 *   // ... later, after re-populating that <select>'s <option>s or
 *   // programmatically changing its .value:
 *   document.getElementById('filterCategory')._selectField.sync();
 *
 * `searchable: true` adds a type-to-filter box above the list — worth it
 * once a select has more than a handful of options (e.g. the Category
 * filters' 20+ entries); leave it off for short lists like Enabled/Disabled.
 */
export function enhanceSelect(selectEl, { searchable = false } = {}) {
  if (!selectEl) return null;
  if (selectEl._selectField) return selectEl._selectField; // idempotent — safe to call more than once

  selectEl.hidden = true;
  selectEl.setAttribute('aria-hidden', 'true');
  selectEl.tabIndex = -1;

  const trigger = el(`
    <button type="button" class="filter-dropdown-trigger select-field-trigger">
      <span class="filter-dropdown-label"></span>
      <span class="filter-dropdown-caret">▾</span>
    </button>
  `);
  selectEl.insertAdjacentElement('afterend', trigger);
  const labelEl = trigger.querySelector('.filter-dropdown-label');

  function currentOptions() {
    return Array.from(selectEl.options).map((o) => ({ value: o.value, label: o.textContent, disabled: o.disabled }));
  }

  /** Re-reads the wrapped <select>'s current options/value/disabled state. Call after changing any of them programmatically. */
  function sync() {
    trigger.disabled = selectEl.disabled;
    trigger.classList.toggle('is-disabled', selectEl.disabled);
    const options = currentOptions();
    const match = options.find((o) => o.value === selectEl.value);
    labelEl.textContent = match ? match.label : (options[0]?.label || '');
  }

  trigger.addEventListener('click', () => {
    if (selectEl.disabled) return;
    const options = currentOptions();
    openDropdownMenu({
      anchor: trigger,
      searchable: searchable && options.length > 6,
      selectedValue: selectEl.value,
      items: options
        .filter((o) => !o.disabled)
        .map((o) => ({
          label: o.label,
          value: o.value,
          onClick: () => {
            if (selectEl.value !== o.value) {
              selectEl.value = o.value;
              // Some code (e.g. filter/apply logic) listens for 'change' on
              // the underlying <select> exactly as it would for a real user
              // interaction — dispatching this is what keeps that working
              // unchanged.
              selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            sync();
          }
        }))
    });
  });

  sync();

  // A native <select>'s associated <label for="..."> normally focuses and
  // opens it on click. Since the real <select> is now hidden (and can't
  // be focused), that label would otherwise silently do nothing — this
  // keeps that click meaningful by forwarding it to the visible trigger.
  if (selectEl.id) {
    const root = selectEl.getRootNode();
    const label = root.querySelector ? root.querySelector(`label[for="${CSS.escape(selectEl.id)}"]`) : null;
    if (label) label.addEventListener('click', (e) => { e.preventDefault(); trigger.click(); });
  }

  const field = { sync, trigger };
  selectEl._selectField = field;
  return field;
}
