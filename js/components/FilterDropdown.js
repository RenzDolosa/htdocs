import { el, esc } from '../utils/dom.js';
import { openDropdownMenu } from './DropdownMenu.js';

/**
 * A select-like filter control that looks like a bordered input with a
 * dropdown caret, but opens a DropdownMenu popover instead of a native
 * <select> list. Its placeholder text (e.g. "Whether to enable") is shown
 * only in the closed/unselected state — it is deliberately not one of the
 * selectable menu items, since it represents "no filter chosen" rather
 * than a real option.
 */
export function buildFilterDropdown({ placeholder, options, onSelect }) {
  const trigger = el(`
    <button type="button" class="filter-dropdown-trigger is-placeholder">
      <span class="filter-dropdown-label">${esc(placeholder)}</span>
      <span class="filter-dropdown-caret">▾</span>
    </button>
  `);
  const labelEl = trigger.querySelector('.filter-dropdown-label');

  function setValue(value) {
    const match = options.find((o) => o.value === value);
    labelEl.textContent = match ? match.label : placeholder;
    trigger.classList.toggle('is-placeholder', !match);
  }

  trigger.addEventListener('click', () => {
    openDropdownMenu({
      anchor: trigger,
      items: options.map((o) => ({
        label: o.label,
        onClick: () => { setValue(o.value); onSelect(o.value); }
      }))
    });
  });

  return { node: trigger, setValue };
}
