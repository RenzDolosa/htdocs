import { el } from '../utils/dom.js';
import { fmtInt } from '../utils/format.js';

/**
 * A small progress bar for CSV import — built once, inserted into an
 * import modal's body, and driven by processInChunks' onProgress callback.
 * Both Manage and Inventory Assets use the same one rather than each
 * hand-rolling their own markup/animation.
 */
export function buildImportProgress() {
  const node = el(`
    <div class="import-progress" hidden>
      <div class="import-progress-track"><div class="import-progress-fill" style="width:0%"></div></div>
      <div class="import-progress-label">Preparing…</div>
    </div>
  `);

  const fill = node.querySelector('.import-progress-fill');
  const label = node.querySelector('.import-progress-label');

  return {
    node,

    start() {
      node.hidden = false;
      fill.style.width = '0%';
      label.textContent = 'Preparing…';
    },

    update(done, total) {
      const pct = total > 0 ? Math.round((done / total) * 100) : 100;
      fill.style.width = `${pct}%`;
      label.textContent = `Importing ${fmtInt(done)} of ${fmtInt(total)} rows… (${pct}%)`;
    },

    finish(message) {
      fill.style.width = '100%';
      label.textContent = message || 'Done.';
    },

    hide() {
      node.hidden = true;
    }
  };
}
