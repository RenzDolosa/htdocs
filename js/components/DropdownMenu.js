import { el } from '../utils/dom.js';

/**
 * DropdownMenu is a generic, reusable popover menu component — same spirit
 * as Modal/Toast: it builds its own DOM, mounts to <body>, anchors itself
 * under a trigger element, and cleans up on close(). Any feature can call
 * openDropdownMenu({...}) without touching index.html.
 *
 * Only one DropdownMenu may be open at a time app-wide (see `activeMenu`
 * below) — opening a second one always closes the first, so repeated
 * clicks on an "Add asset" style trigger can never stack menus on top of
 * each other.
 *
 * Usage (plain action menu):
 *   openDropdownMenu({
 *     anchor: someButtonEl,
 *     items: [
 *       { label: 'Add Manage', onClick: () => ... },
 *       { label: 'Import', onClick: () => ... },
 *       { label: 'Delete', danger: true, onClick: () => ... }  // optional — red on hover/active, for a destructive item mixed into an otherwise plain menu
 *     ]
 *   });
 *
 * Select-style usage (see components/SelectField.js, which is what most
 * callers should actually use instead of calling this directly):
 *   openDropdownMenu({
 *     anchor: triggerEl,
 *     selectedValue: 'PHP',                 // highlights + scrolls to that item
 *     searchable: true,                     // adds a filter box above long lists
 *     items: [{ label: 'Philippine peso', value: 'PHP', onClick: () => ... }, ...]
 *   });
 */

/** Module-level singleton: the one DropdownMenu currently open, if any. */
let activeMenu = null;

export class DropdownMenu {
  constructor({ anchor, items = [], align = 'start', selectedValue, searchable = false } = {}) {
    this.anchor = anchor;
    this.items = items;
    this.align = align;
    this.selectedValue = selectedValue;
    this.searchable = searchable;
    this._activeIndex = -1;
    this._handleDocClick = this._handleDocClick.bind(this);
    this._handleKeydown = this._handleKeydown.bind(this);
    this._build();
  }

  _build() {
    this.menuEl = el(`<div class="dropdown-menu" role="menu"></div>`);

    if (this.searchable) {
      this.searchInput = el(`<input type="text" class="dropdown-menu-search" placeholder="Type to filter...">`);
      this.searchInput.addEventListener('input', () => this._applyFilter());
      this.searchInput.addEventListener('keydown', (e) => {
        // Arrow/Enter/Escape are handled centrally by _handleKeydown (bound
        // on document); this only needs to stop them from also doing their
        // native text-input thing (moving the caret, etc.).
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) e.preventDefault();
      });
      this.menuEl.appendChild(this.searchInput);
    }

    this.listEl = el(`<div class="dropdown-menu-list"></div>`);
    this.menuEl.appendChild(this.listEl);

    this._itemEntries = this.items.map((item) => {
      const btn = el(`<button tabindex="-1" type="button" class="dropdown-menu-item" role="menuitem"></button>`);
      btn.textContent = item.label;
      const isSelected = item.value !== undefined && item.value === this.selectedValue;
      btn.classList.toggle('is-selected', isSelected);
      btn.classList.toggle('is-danger', Boolean(item.danger));
      const entry = { item, btn, isSelected };
      btn.addEventListener('click', () => {
        this.close();
        item.onClick?.();
      });
      btn.addEventListener('mouseenter', () => this._setActiveIndex(this._itemEntries.indexOf(entry), false));
      this.listEl.appendChild(btn);
      return entry;
    });

    const preselected = this._itemEntries.findIndex((e) => e.isSelected);
    this._activeIndex = preselected >= 0 ? preselected : (this._itemEntries.length ? 0 : -1);
  }

  _applyFilter() {
    const query = this.searchInput.value.trim().toLowerCase();
    this._itemEntries.forEach(({ item, btn }) => {
      btn.hidden = !!query && !item.label.toLowerCase().includes(query);
    });
    const firstVisible = this._itemEntries.findIndex((e) => !e.btn.hidden);
    this._setActiveIndex(firstVisible, false);
  }

  _setActiveIndex(index, scroll = true) {
    if (this._activeIndex >= 0 && this._itemEntries[this._activeIndex]) {
      this._itemEntries[this._activeIndex].btn.classList.remove('is-active');
    }
    this._activeIndex = index;
    const entry = this._itemEntries[index];
    if (entry) {
      entry.btn.classList.add('is-active');
      if (scroll) entry.btn.scrollIntoView({ block: 'nearest' });
    }
  }

  open() {
    // Enforce the single-menu-at-a-time rule at the source, not just at
    // the openDropdownMenu() call site, so nothing can bypass it by using
    // `new DropdownMenu(...).open()` directly.
    if (activeMenu && activeMenu !== this) activeMenu.close();
    activeMenu = this;

    document.body.appendChild(this.menuEl);
    this._position();
    requestAnimationFrame(() => {
      this.menuEl.classList.add('open');
      if (this._activeIndex >= 0 && this._itemEntries[this._activeIndex]) {
        this._itemEntries[this._activeIndex].btn.classList.add('is-active');
      }
      const selected = this._itemEntries.find((e) => e.isSelected);
      if (selected) selected.btn.scrollIntoView({ block: 'nearest' });
      if (this.searchInput) this.searchInput.focus();
    });
    // Deferred so the same click that opened the menu (which bubbles to
    // document) doesn't immediately trigger _handleDocClick and close it.
    setTimeout(() => {
      document.addEventListener('click', this._handleDocClick);
      document.addEventListener('keydown', this._handleKeydown);
    }, 0);
  }

  _position() {
    const rect = this.anchor.getBoundingClientRect();
    const menuRect = this.menuEl.getBoundingClientRect();
    let left = this.align === 'end' ? rect.right - menuRect.width : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
    // Flip above the anchor if there isn't enough room below — long
    // (category-length) lists would otherwise run off the bottom of the
    // viewport with no way to reach the lower options.
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < menuRect.height + 12 && rect.top > menuRect.height + 12;
    const top = openUpward ? rect.top - menuRect.height - 6 : rect.bottom + 6;
    this.menuEl.style.left = `${left + window.scrollX}px`;
    this.menuEl.style.top = `${top + window.scrollY}px`;
  }

  close() {
    if (activeMenu === this) activeMenu = null;
    document.removeEventListener('click', this._handleDocClick);
    document.removeEventListener('keydown', this._handleKeydown);
    this.menuEl.remove();
  }

  _handleDocClick(e) {
    if (!this.menuEl.contains(e.target) && e.target !== this.anchor) this.close();
  }

  _handleKeydown(e) {
    if (e.key === 'Escape') {
      this.close();
      return;
    }
    const visible = this._itemEntries.map((entry, i) => ({ entry, i })).filter(({ entry }) => !entry.btn.hidden);
    if (!visible.length) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const currentPos = visible.findIndex(({ i }) => i === this._activeIndex);
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const nextPos = (currentPos + delta + visible.length) % visible.length;
      this._setActiveIndex(visible[nextPos].i);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const active = this._itemEntries[this._activeIndex];
      if (active) active.btn.click();
    }
  }
}

/**
 * Convenience wrapper: builds and opens a menu, with a toggle shortcut —
 * clicking the same anchor that already has its menu open just closes it
 * again instead of tearing it down and immediately reopening an identical
 * one (which would flicker and is pointless work).
 */
export function openDropdownMenu(opts) {
  if (activeMenu && activeMenu.anchor === opts.anchor) {
    activeMenu.close();
    return null;
  }
  const menu = new DropdownMenu(opts);
  menu.open();
  return menu;
}
