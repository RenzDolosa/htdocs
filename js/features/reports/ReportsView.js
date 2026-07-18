import { esc } from '../../utils/dom.js';
import { fmtInt, fmtDate } from '../../utils/format.js';

/**
 * ReportsView owns DOM rendering only — it receives plain data from
 * ReportsController and never touches a Store directly, same split as
 * every other feature's View.
 */
export class ReportsView {
  constructor(refs) {
    this.refs = refs;
  }

  /** Same button/flyout behavior as Manage's "Warehouse" filter — hidden
   * when there's nothing to filter by, otherwise shown with its label
   * reflecting the active selection. */
  renderWarehouseFilterButton(hasOptions, activeOwner) {
    const btn = this.refs.warehouseFilterBtn;
    if (!btn) return;
    btn.hidden = !hasOptions;
    btn.classList.toggle('active', activeOwner !== 'all');
    btn.textContent = activeOwner === 'all' ? 'Warehouse' : activeOwner;
    btn.title = activeOwner === 'all' ? 'Filter by warehouse' : `Filtered by warehouse: ${activeOwner}`;
  }

  renderStats(stats, handlers = {}) {
    const el = this.refs.reportStats;
    if (!el) return;
    el.innerHTML = stats.map((s) => `
      <div class="report-stat${s.tone ? ` report-stat--${s.tone}` : ''}${s.key && handlers[s.key] ? ' report-stat--clickable' : ''}"${s.key ? ` data-stat-key="${s.key}"` : ''}>
        <div class="report-stat-value">${fmtInt(s.value)}</div>
        <div class="report-stat-label">${esc(s.label)}</div>
      </div>
    `).join('');

    stats.forEach((s) => {
      if (!s.key || !handlers[s.key]) return;
      const node = el.querySelector(`[data-stat-key="${s.key}"]`);
      node?.addEventListener('click', () => handlers[s.key]());
    });
  }

  /** @param {string} refKey - which refs.<id> container to render into (e.g. 'reportByCategory') */
  renderBreakdown(refKey, rows) {
    const el = this.refs[refKey];
    if (!el) return;
    if (rows.length === 0) {
      el.innerHTML = '<div class="report-bars-empty">No data yet.</div>';
      return;
    }
    const max = Math.max(...rows.map((r) => r.count));
    el.innerHTML = rows.map((r) => `
      <div class="report-bar-row">
        <div class="report-bar-row-top">
          <span>${esc(r.label)}</span>
          <span class="report-bar-count">${fmtInt(r.count)}</span>
        </div>
        <div class="report-bar-track"><div class="report-bar-fill" style="width:${Math.round((r.count / max) * 100)}%"></div></div>
      </div>
    `).join('');
  }

  /** Same layout as renderBreakdown, but each row carries a second number
   * — how many of that category's gadgets are assigned to a warehouse —
   * shown as an "X assigned" figure plus a bar scaled to that category's
   * own quantity (100% = this row's count, not the largest category on
   * the card), so the assigned share within each category reads on its
   * own terms. Only the "Gadgets by Category" card uses this; every
   * other breakdown card still goes through renderBreakdown above. */
  renderCategoryBreakdown(refKey, rows) {
    const el = this.refs[refKey];
    if (!el) return;
    if (rows.length === 0) {
      el.innerHTML = '<div class="report-bars-empty">No data yet.</div>';
      return;
    }
    el.innerHTML = rows.map((r) => `
      <div class="report-bar-row">
        <div class="report-bar-row-top">
          <span>${esc(r.label)}</span>
          <span class="report-bar-metrics">
            <span class="report-bar-count">${fmtInt(r.count)}</span>
            <span class="report-bar-sep">/</span>
            <span class="report-bar-assigned">${fmtInt(r.assigned)} assigned</span>
          </span>
        </div>
        <div class="report-bar-track">
          <div class="report-bar-fill--assigned" style="width:${r.count > 0 ? Math.round((r.assigned / r.count) * 100) : 0}%"></div>
        </div>
      </div>
    `).join('');
  }

  renderActivity(entries) {
    const el = this.refs.reportActivityFeed;
    if (!el) return;
    if (entries.length === 0) {
      el.innerHTML = '<div class="report-activity-empty">No activity recorded yet.</div>';
      return;
    }
    el.innerHTML = `<ul class="log-list">${entries.map((entry) => this._entryHTML(entry)).join('')}</ul>`;
  }

  /** Reuses LogModal's .log-entry/.log-dot/.log-message styling so this
   * cross-asset feed reads as the same visual language as a single
   * gadget's own history — just with the asset name prefixed, since
   * entries from many records are interleaved here. */
  _entryHTML(entry) {
    const by = entry.performedBy ? esc(entry.performedBy) : 'Unknown';
    return `
      <li class="log-entry log-entry--${esc(entry.type || 'update')}">
        <span class="log-dot" aria-hidden="true"></span>
        <div class="log-entry-body">
          <div class="log-message"><span class="report-log-asset">${esc(entry.assetLabel)}</span> — ${esc(entry.message)}</div>
          <div class="log-time">${fmtDate(entry.timestamp)} <span class="log-sep">·</span> <span class="log-user">By ${by}</span></div>
        </div>
      </li>`;
  }
}