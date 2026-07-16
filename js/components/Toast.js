import { el } from '../utils/dom.js';

/**
 * Toast is a tiny singleton notification service. Any module can call
 * Toast.show(...) without mounting anything itself first — the stack
 * container is created lazily on first use.
 */
class ToastService {
  constructor() {
    this._stack = null;
  }

  _ensureStack() {
    if (!this._stack) {
      this._stack = el(`<div class="toast-stack"></div>`);
      document.body.appendChild(this._stack);
    }
    return this._stack;
  }

  /** @param {string} message @param {'default'|'success'|'error'} [type] */
  show(message, type = 'default') {
    const stack = this._ensureStack();
    const toast = el(`<div class="toast${type !== 'default' ? ' ' + type : ''}"></div>`);
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.2s ease';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, 2400);
  }

  success(message) { this.show(message, 'success'); }
  error(message) { this.show(message, 'error'); }
}

export const Toast = new ToastService();
