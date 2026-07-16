import { Modal } from './Modal.js';
import { esc } from '../utils/dom.js';

/**
 * Promise-based confirmation dialog, built on the generic Modal.
 * Usage: const ok = await confirmDialog({ title, message, confirmLabel, danger: true });
 */
export function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const modal = new Modal({
      title,
      body: `<div class="modal-body--message">${esc(message)}</div>`,
      onClose: () => settle(false),
      footer: [
        { label: cancelLabel, variant: 'btn-outline', onClick: (m) => m.close() },
        {
          label: confirmLabel,
          variant: danger ? 'btn-danger' : 'btn-accent',
          onClick: (m) => { settle(true); m.close(); }
        }
      ]
    });
    modal.open();
  });
}
