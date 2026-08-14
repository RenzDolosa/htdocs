import { el, esc } from '../utils/dom.js';

/**
 * SuggestList is an anchored popover for autocomplete-style suggestions
 * that need a two-column table shape — a fixed header row (e.g. "CATEGORY
 * / AVAILABLE") above a body that scrolls on its own — rather than
 * DropdownMenu's single flat scrolling list with no header. Same anchor/
 * position/singleton/keyboard behavior as DropdownMenu.js (only one open
 * app-wide, closes on outside click or Escape, arrow keys + Enter to
 * pick), kept as its own small component instead of extending
 * DropdownMenu so every one of DropdownMenu's *other* callers (filter
 * bars, Select fields, etc.) doesn't pick up a header/two-column shape
 * they never asked for.
 *
 * Usage:
 *   new SuggestList({
 *     anchor: inputEl,
 *     columns: ['Category', 'Available'],
 *     rows: [
 *       { cells: ['KAICOM', '2'], onClick: () => ... },
 *       { cells: ['MOUSE', 'No stock'], className: 'is-zero', onClick: () => ... }
 *     ]
 *   }).open();
 */

/** Module-level singleton, same rule as DropdownMenu: opening a second
 * list always closes whichever one is already open. */
let activeList = null;

export class SuggestList {
  constructor({ anchor, columns = [], rows = [] } = {}) {
    this.anchor = anchor;
    this.rows = rows;
    this._handleDocClick = this._handleDocClick.bind(this);
    this._handleKeydown = this._handleKeydown.bind(this);
    this._build(columns);
  }

  _build(columns) {
    this.menuEl = el(`<div class="suggest-list" role="listbox"></div>`);
    this.menuEl.innerHTML = `
      <div class="suggest-list-head">${columns.map((c) => `<span>${esc(c)}</span>`).join('')}</div>
      <div class="suggest-list-body"></div>
    `;
    this.bodyEl = this.menuEl.querySelector('.suggest-list-body');

    this._itemEntries = this.rows.map((row) => {
      const btn = el(`<button tabindex="-1" type="button" class="suggest-list-row" role="option"></button>`);
      if (row.className) btn.classList.add(row.className);
      btn.innerHTML = row.cells.map((c) => `<span>${esc(c)}</span>`).join('');
      const entry = { row, btn };
      btn.addEventListener('click', () => { this.close(); row.onClick?.(); });
      btn.addEventListener('mouseenter', () => this._setActiveIndex(this._itemEntries.indexOf(entry), false));
      this.bodyEl.appendChild(btn);
      return entry;
    });

    this._activeIndex = this._itemEntries.length ? 0 : -1;
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
    if (this._itemEntries.length === 0) return; // nothing to suggest — don't show an empty box

    if (activeList && activeList !== this) activeList.close();
    activeList = this;

    document.body.appendChild(this.menuEl);
    this._position();
    requestAnimationFrame(() => {
      this.menuEl.classList.add('open');
      if (this._itemEntries[this._activeIndex]) this._itemEntries[this._activeIndex].btn.classList.add('is-active');
    });
    // Deferred so the same click/keystroke that opened this doesn't
    // immediately trigger _handleDocClick and close it right back up.
    setTimeout(() => {
      document.addEventListener('click', this._handleDocClick);
      document.addEventListener('keydown', this._handleKeydown);
    }, 0);
  }

  _position() {
    const rect = this.anchor.getBoundingClientRect();
    const menuRect = this.menuEl.getBoundingClientRect();
    let left = rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < menuRect.height + 12 && rect.top > menuRect.height + 12;
    const top = openUpward ? rect.top - menuRect.height - 6 : rect.bottom + 6;
    this.menuEl.style.left = `${left + window.scrollX}px`;
    this.menuEl.style.top = `${top + window.scrollY}px`;
    this.menuEl.style.width = `${Math.max(rect.width, 260)}px`;
  }

  close() {
    if (activeList === this) activeList = null;
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
    if (!this._itemEntries.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const next = (this._activeIndex + delta + this._itemEntries.length) % this._itemEntries.length;
      this._setActiveIndex(next);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const active = this._itemEntries[this._activeIndex];
      if (active) active.btn.click();
    }
  }
}
