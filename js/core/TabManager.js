import { esc, qsa } from '../utils/dom.js';
import { openDropdownMenu } from '../components/DropdownMenu.js';
import { Modal } from '../components/Modal.js';

/**
 * TabManager owns the tabstrip UI and the visibility of pre-existing
 * `[data-tab-panel="id"]` sections. It does not create or destroy feature
 * DOM — panels already exist in index.html (or are added ahead of time);
 * TabManager only decides which one is shown and renders the tab chips.
 *
 * This keeps feature controllers (e.g. ManageController) completely
 * unaware that tabs exist — their refs and DOM never get remounted when
 * the user switches tabs.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.tabstripEl - container the tab chips render into.
 * @param {HTMLElement} opts.panelsEl - container holding all `[data-tab-panel]` sections.
 * @param {Array<{id:string, title:string, pinned?:boolean, closable?:boolean}>} opts.tabs
 *        - registry of every openable tab. `pinned` tabs can't be closed and
 *        are sorted to the front of the strip. System tabs (`closable: false`,
 *        e.g. "Home Page") are permanently fixed: they can't be dragged,
 *        right-clicked, or pinned/unpinned by the user — they're already as
 *        pinned as a tab can get.
 *
 * Two interactions layered on top of the basic open/close/activate API:
 *  - Drag-and-drop reordering: any closable tab can be dragged and dropped
 *    onto another closable tab to move it there.
 *  - Right-click → Pin tab / Unpin tab: toggles `tab.pinned`, which hides
 *    the close button and sorts the tab to the front of the strip
 *    (stable — pinned tabs keep their relative order among each other).
 */
export class TabManager {
  constructor({ tabstripEl, panelsEl, tabs = [] }) {
    this.tabstripEl = tabstripEl;
    this.panelsEl = panelsEl;
    this.registry = new Map(tabs.map((t) => [t.id, { closable: true, pinned: false, ...t }]));
    this.openIds = [];
    this.activeId = null;
    this._onActivateHandlers = [];
  }

  /** Registers a callback fired with the tab id whenever a tab becomes active. */
  onActivate(handler) {
    this._onActivateHandlers.push(handler);
  }

  /** Opens a tab (adding it to the strip if not already open) and activates it. */
  open(id) {
    if (!this.registry.has(id)) return;
    if (!this.openIds.includes(id)) this.openIds.push(id);
    this.activate(id);
  }

  /** Closes a tab. Pinned tabs are ignored. Falls back to a neighboring tab if the active one closes. */
  close(id) {
    const tab = this.registry.get(id);
    if (!tab || tab.pinned) return;
    const idx = this.openIds.indexOf(id);
    if (idx === -1) return;

    this.openIds.splice(idx, 1);
    if (this.activeId === id) {
      const fallback = this.openIds[idx] ?? this.openIds[idx - 1] ?? this.openIds[0] ?? null;
      this.activate(fallback);
    } else {
      this._render();
    }
  }

  activate(id) {
    if (id && !this.openIds.includes(id)) this.openIds.push(id);
    this.activeId = id;
    // A modal left open from whatever section was showing before has no
    // business floating on top of a newly-selected one (see the video
    // this was reported with — a Manifest modal stayed open over
    // Settings after switching tabs). Every modal in the app goes
    // through Modal, so this one call covers all of them.
    Modal.closeAll();
    this._render();
    if (id) this._onActivateHandlers.forEach((fn) => fn(id));
  }

  _render() {
    this.tabstripEl.innerHTML = this.openIds.map((id) => {
      const tab = this.registry.get(id);
      const active = id === this.activeId;
      return `
        <div class="tab${active ? ' active' : ''}${tab.pinned ? ' pinned' : ''}" data-tab-id="${id}" ${tab.closable ? 'draggable="true"' : ''}>
          ${tab.pinned ? '' : ''}
          <span class="tab-label">${esc(tab.title)}</span>
          ${tab.closable && !tab.pinned ? `<button tabindex="-1" type="button" class="tab-close" data-close-tab aria-label="Close ${esc(tab.title)}">&times;</button>` : ''}
        </div>
      `;
    }).join('');

    qsa('.tab', this.tabstripEl).forEach((tabEl) => {
      const id = tabEl.getAttribute('data-tab-id');
      const tab = this.registry.get(id);

      tabEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-close-tab]')) return;
        this.activate(id);
      });
      const closeBtn = tabEl.querySelector('[data-close-tab]');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.close(id);
        });
      }

      // System-fixed tabs (closable: false, e.g. Home) skip pin/drag entirely —
      // they're already permanently first and can't be reordered around.
      if (!tab.closable) return;

      tabEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openDropdownMenu({
          anchor: tabEl,
          items: [
            { label: tab.pinned ? 'Unpin tab' : 'Pin tab', onClick: () => this.togglePin(id) }
          ]
        });
      });

      tabEl.addEventListener('dragstart', (e) => {
        this._dragId = id;
        tabEl.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
      });
      tabEl.addEventListener('dragend', () => {
        tabEl.classList.remove('dragging');
        this._dragId = null;
      });
      tabEl.addEventListener('dragover', (e) => {
        if (!this._dragId || this._dragId === id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      tabEl.addEventListener('drop', (e) => {
        if (!this._dragId || this._dragId === id) return;
        e.preventDefault();
        this._reorder(this._dragId, id);
      });
    });

    qsa('[data-tab-panel]', this.panelsEl).forEach((panel) => {
      panel.hidden = panel.getAttribute('data-tab-panel') !== this.activeId;
    });

    qsa('.rail-icon[data-open-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-open-tab') === this.activeId);
    });
  }

  /** Toggles a tab's pinned state, then re-sorts the strip so pinned tabs
   * group at the front. The sort is stable, so relative order within the
   * pinned group and within the unpinned group is preserved — only the
   * toggled tab actually moves. System-fixed tabs (closable: false) are
   * exempt; they're already permanently first. */
  togglePin(id) {
    const tab = this.registry.get(id);
    if (!tab || !tab.closable) return;
    tab.pinned = !tab.pinned;
    this.openIds = [...this.openIds].sort((a, b) => {
      const pa = this.registry.get(a)?.pinned ? 0 : 1;
      const pb = this.registry.get(b)?.pinned ? 0 : 1;
      return pa - pb;
    });
    this._render();
  }

  /** Moves `draggedId` to sit immediately before `targetId` in the open-tabs
   * order. Both ids are expected to belong to closable (draggable) tabs —
   * system-fixed tabs never register drag listeners in the first place. */
  _reorder(draggedId, targetId) {
    const from = this.openIds.indexOf(draggedId);
    if (from === -1) return;
    this.openIds.splice(from, 1);
    const to = this.openIds.indexOf(targetId);
    if (to === -1) {
      // Target vanished mid-drag (shouldn't normally happen) — put it back.
      this.openIds.splice(from, 0, draggedId);
      return;
    }
    this.openIds.splice(to, 0, draggedId);
    this._render();
  }
}
