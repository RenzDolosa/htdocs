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
 * Usage:
 *   openDropdownMenu({
 *     anchor: someButtonEl,
 *     items: [
 *       { label: 'Add Manage', onClick: () => ... },
 *       { label: 'Import', onClick: () => ... }
 *     ]
 *   });
 */

/** Module-level singleton: the one DropdownMenu currently open, if any. */
let activeMenu = null;

export class DropdownMenu {
  constructor({ anchor, items = [], align = 'start' } = {}) {
    this.anchor = anchor;
    this.items = items;
    this.align = align;
    this._handleDocClick = this._handleDocClick.bind(this);
    this._handleKeydown = this._handleKeydown.bind(this);
    this._build();
  }

  _build() {
    this.menuEl = el(`<div class="dropdown-menu" role="menu"></div>`);
    this.items.forEach((item) => {
      const btn = el(`<button type="button" class="dropdown-menu-item" role="menuitem"></button>`);
      btn.textContent = item.label;
      btn.addEventListener('click', () => {
        this.close();
        item.onClick?.();
      });
      this.menuEl.appendChild(btn);
    });
  }

  open() {
    // Enforce the single-menu-at-a-time rule at the source, not just at
    // the openDropdownMenu() call site, so nothing can bypass it by using
    // `new DropdownMenu(...).open()` directly.
    if (activeMenu && activeMenu !== this) activeMenu.close();
    activeMenu = this;

    document.body.appendChild(this.menuEl);
    this._position();
    requestAnimationFrame(() => this.menuEl.classList.add('open'));
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
    const top = rect.bottom + 6;
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
    if (e.key === 'Escape') this.close();
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
