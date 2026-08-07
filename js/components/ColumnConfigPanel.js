import { el, esc } from '../utils/dom.js';

/**
 * ColumnConfigPanel is an anchored popover — same open/close/position
 * pattern as DropdownMenu.js — for editing a table's column
 * configuration (see core/ColumnConfig.js): which columns show, how
 * wide, whether pinned ("fixed") to the left edge while scrolling, and
 * in what order.
 *
 * All edits happen on a local working copy; nothing is applied to the
 * table or persisted until Save is clicked. Cancel (or clicking outside,
 * or Escape) discards the working copy entirely — the table keeps
 * whatever configuration was already active. Reset Settings reverts the
 * *working copy* back to defaults, still requiring Save to actually take
 * effect — it's meant to feel like "start over from scratch, then decide
 * whether to keep it," not an instant, unconfirmable revert.
 *
 * Deliberately no title/header bar — the panel opens right under the
 * icon that summoned it, which is context enough for what it's for.
 *
 * The row-number/select column and Actions column aren't included in
 * `columns` at all (see ColumnConfig's own doc comment) — there's
 * nothing for this panel to show for either of them.
 */
let activePanel = null;

export class ColumnConfigPanel {
  constructor({ anchor, columns, onSave, onReset }) {
    this.anchor = anchor;
    this.working = columns.map((c) => ({ ...c }));
    this.onSave = onSave;
    this.onReset = onReset;
    this._handleDocClick = this._handleDocClick.bind(this);
    this._handleKeydown = this._handleKeydown.bind(this);
    this._build();
  }

  _build() {
    this.panelEl = el(`
      <div class="column-config-panel" role="dialog" aria-label="Column configuration">
        <div class="column-config-body"></div>
        <div class="column-config-footer">
          <button tabindex="-1" type="button" class="btn btn-outline btn-sm" data-action="reset">Reset Settings</button>
          <div class="column-config-footer-right">
            <button tabindex="-1" type="button" class="btn btn-outline" data-action="cancel">Cancel</button>
            <button tabindex="-1" type="button" class="btn btn-accent" data-action="save">Save</button>
          </div>
        </div>
      </div>
    `);
    this.bodyEl = this.panelEl.querySelector('.column-config-body');
    this._renderRows();

    this.panelEl.querySelector('[data-action="reset"]').addEventListener('click', () => {
      this.working = this.onReset();
      this._renderRows();
    });
    this.panelEl.querySelector('[data-action="cancel"]').addEventListener('click', () => this.close());
    this.panelEl.querySelector('[data-action="save"]').addEventListener('click', () => {
      this.onSave(this.working);
      this.close();
    });
  }

  _renderRows() {
    this.bodyEl.innerHTML = '';

    // The row-number/select column: always on, never configurable — shown
    // pinned to the top of the list so its presence (and why it has no
    // controls) is obvious, same spot the reference pattern for this
    // puts its own always-on identity column.
    this.bodyEl.appendChild(el(`
      <div class="column-config-row column-config-row-locked">
        <label class="checkbox-inline"><input type="checkbox" checked disabled> Serial#</label>
      </div>
    `));

    this.working.forEach((col, index) => {
      const row = el(`
        <div class="column-config-row">
          <label class="checkbox-inline column-config-name">
            <input type="checkbox" data-role="visible" ${col.visible !== false ? 'checked' : ''}>
            ${esc(col.label)}
          </label>
          <span class="column-config-width-label">Width</span>
          <input type="number" class="column-config-width" data-role="width" value="${Number(col.width) || 120}" min="40" max="600" step="10">
          <label class="column-config-fixed-toggle">
            <span>Fixed</span>
            <span class="switch"><input type="checkbox" data-role="fixed" ${col.fixed ? 'checked' : ''}><span class="switch-track"></span></span>
          </label>
          <div class="column-config-move">
            <button tabindex="-1" type="button" class="icon-btn" data-role="up" aria-label="Move up" ${index === 0 ? 'disabled' : ''}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
            </button>
            <button tabindex="-1" type="button" class="icon-btn" data-role="down" aria-label="Move down" ${index === this.working.length - 1 ? 'disabled' : ''}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
        </div>
      `);

      row.querySelector('[data-role="visible"]').addEventListener('change', (e) => { col.visible = e.target.checked; });
      row.querySelector('[data-role="width"]').addEventListener('change', (e) => {
        const n = Number(e.target.value);
        col.width = Number.isFinite(n) ? Math.max(40, Math.min(600, n)) : col.width;
        e.target.value = col.width;
      });
      row.querySelector('[data-role="fixed"]').addEventListener('change', (e) => { col.fixed = e.target.checked; });
      row.querySelector('[data-role="up"]')?.addEventListener('click', () => this._move(index, -1));
      row.querySelector('[data-role="down"]')?.addEventListener('click', () => this._move(index, 1));

      this.bodyEl.appendChild(row);
    });
  }

  _move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= this.working.length) return;
    [this.working[index], this.working[target]] = [this.working[target], this.working[index]];
    this._renderRows();
  }

  open() {
    if (activePanel && activePanel !== this) activePanel.close();
    activePanel = this;

    document.body.appendChild(this.panelEl);
    this._position();
    requestAnimationFrame(() => this.panelEl.classList.add('open'));
    setTimeout(() => {
      document.addEventListener('click', this._handleDocClick);
      document.addEventListener('keydown', this._handleKeydown);
    }, 0);
  }

  _position() {
    const rect = this.anchor.getBoundingClientRect();
    const panelRect = this.panelEl.getBoundingClientRect();
    let left = rect.right - panelRect.width;
    left = Math.max(8, Math.min(left, window.innerWidth - panelRect.width - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < panelRect.height + 12 && rect.top > panelRect.height + 12;
    const top = openUpward ? rect.top - panelRect.height - 6 : rect.bottom + 6;
    this.panelEl.style.left = `${left + window.scrollX}px`;
    this.panelEl.style.top = `${top + window.scrollY}px`;
  }

  close() {
    if (activePanel === this) activePanel = null;
    document.removeEventListener('click', this._handleDocClick);
    document.removeEventListener('keydown', this._handleKeydown);
    this.panelEl.remove();
  }

  _handleDocClick(e) {
    // composedPath() is captured once at dispatch time and still lists the
    // original ancestor chain even if an element along it — like the move
    // button just clicked — gets removed from the DOM before this bubbles
    // here. contains() would instead check against the *current* DOM,
    // where a just-removed node always reads as "not contained", which is
    // exactly what happens on every up/down click: _move() rebuilds the
    // row list synchronously, detaching the very button mid-click.
    const path = e.composedPath ? e.composedPath() : [e.target];
    if (!path.includes(this.panelEl) && !path.includes(this.anchor)) this.close();
  }

  _handleKeydown(e) {
    if (e.key === 'Escape') this.close();
  }
}

export function openColumnConfigPanel(opts) {
  if (activePanel && activePanel.anchor === opts.anchor) {
    activePanel.close();
    return null;
  }
  const panel = new ColumnConfigPanel(opts);
  panel.open();
  return panel;
}
