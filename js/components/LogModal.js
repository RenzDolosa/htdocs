import { Modal } from './Modal.js';
import { el, esc } from '../utils/dom.js';

/**
 * LogModal renders a read-only history/audit trail inside the generic
 * Modal. It only needs a title and an array of { message, timestamp, type }
 * entries — it has no idea whether those entries came from a Gadget,
 * an Item, or anything else, so it's reusable across features.
 *
 * Entries are grouped into tabs by `type` so a reader can jump straight to
 * warehouse transfers, user reassignments, or remarks changes instead of
 * scrolling a flat feed. "All" always shows everything, including entries
 * whose type doesn't match a dedicated tab (e.g. 'create', 'update').
 */
const TABS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'transfer', label: 'Transfers', match: (e) => e.type === 'transfer' },
  { key: 'user', label: 'Users', match: (e) => e.type === 'user' },
  { key: 'remarks', label: 'Remarks', match: (e) => e.type === 'remarks' }
];

export function openLogModal({ title = 'History', entries = [] } = {}) {
  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);
  let activeTab = 'all';

  function entryHTML(entry) {
    const by = entry.performedBy ? esc(entry.performedBy) : 'Unknown';
    return `
      <li class="log-entry log-entry--${esc(entry.type || 'update')}">
        <span class="log-dot" aria-hidden="true"></span>
        <div class="log-entry-body">
          <div class="log-message">${esc(entry.message)}</div>
          <div class="log-time">${esc(new Date(entry.timestamp).toLocaleString())} <span class="log-sep">·</span> <span class="log-user">By ${by}</span></div>
        </div>
      </li>`;
  }

  function listHTML() {
    const tab = TABS.find((t) => t.key === activeTab);
    const filtered = sorted.filter(tab.match);
    return filtered.length
      ? `<ul class="log-list">${filtered.map(entryHTML).join('')}</ul>`
      : `<div class="modal-body--message">No ${tab.key === 'all' ? 'activity' : tab.label.toLowerCase()} recorded yet.</div>`;
  }

  function tabsHTML() {
    return TABS.map((t) => `<button tabindex="-1" type="button" class="log-tab${t.key === activeTab ? ' active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('');
  }

  const bodyNode = el(`
    <div class="log-modal-body">
      <div class="log-tabs">${tabsHTML()}</div>
      <div class="log-list-wrap">${listHTML()}</div>
    </div>
  `);

  function bindTabs() {
    bodyNode.querySelectorAll('.log-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.getAttribute('data-tab') === activeTab) return;
        activeTab = btn.getAttribute('data-tab');
        bodyNode.querySelector('.log-tabs').outerHTML = `<div class="log-tabs">${tabsHTML()}</div>`;
        bodyNode.querySelector('.log-list-wrap').innerHTML = listHTML();
        bindTabs();
      });
    });
  }
  bindTabs();

  const modal = new Modal({
    title,
    body: bodyNode,
    footer: [
      { label: 'Close', variant: 'btn-outline', onClick: (m) => m.close() }
    ]
  });
  modal.open();
  return modal;
}
