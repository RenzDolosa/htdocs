import { el, qsa } from '../utils/dom.js';

/**
 * Modal is a generic, reusable dialog component. It builds its own DOM,
 * mounts to <body> on open(), and cleans up on close(). Any feature can
 * do `new Modal({...}).open()` without touching index.html.
 *
 * Usage:
 *   const modal = new Modal({
 *     title: 'Add item',
 *     body: someNode | 'HTML string',
 *     footer: [
 *       { label: 'Cancel', variant: 'btn-outline', onClick: (m) => m.close() },
 *       { label: 'Save', variant: 'btn-accent', onClick: (m) => { ... } }
 *     ],
 *     onClose: () => {}
 *   });
 *   modal.open();
 */
export class Modal {
  constructor({ title = '', body = '', footer = [], onClose = null, closeOnOverlayClick = true, size = '' } = {}) {
    this.onClose = onClose;
    this.closeOnOverlayClick = closeOnOverlayClick;
    this._previousFocus = null;
    this._handleKeydown = this._handleKeydown.bind(this);
    this._build(title, body, footer, size);
  }

  _build(title, body, footer, size) {
    this.overlay = el(`<div class="overlay" role="dialog" aria-modal="true"></div>`);
    this.modalEl = el(`<div class="modal${size ? ` modal--${size}` : ''}"></div>`);

    this.headEl = el(`
      <div class="modal-head">
        <h2></h2>
        <button type="button" class="modal-close" aria-label="Close">✕</button>
      </div>
    `);
    this.headEl.querySelector('h2').textContent = title;
    this.headEl.querySelector('.modal-close').addEventListener('click', () => this.close());

    this.bodyEl = el(`<div class="modal-body"></div>`);
    this.setBody(body);

    this.footEl = el(`<div class="modal-foot"></div>`);
    this.setFooter(footer);

    this.modalEl.append(this.headEl, this.bodyEl, this.footEl);
    this.overlay.appendChild(this.modalEl);

    this.overlay.addEventListener('click', (e) => {
      if (this.closeOnOverlayClick && e.target === this.overlay) this.close();
    });
  }

  /** Replace the modal body with a string of HTML or a DOM node. */
  setBody(content) {
    this.bodyEl.innerHTML = '';
    if (content instanceof Node) {
      this.bodyEl.appendChild(content);
    } else if (typeof content === 'string') {
      this.bodyEl.innerHTML = content;
    }
  }

  /** Replace the footer buttons. Each entry: { label, variant, onClick(modal) } */
  setFooter(buttons) {
    this.footEl.innerHTML = '';
    buttons.forEach((btn) => {
      const button = el(`<button type="button" class="btn ${btn.variant || 'btn-outline'}"></button>`);
      button.textContent = btn.label;
      button.addEventListener('click', () => btn.onClick?.(this));
      this.footEl.appendChild(button);
    });
  }

  open() {
    document.body.appendChild(this.overlay);
    this._previousFocus = document.activeElement;
    document.addEventListener('keydown', this._handleKeydown);
    requestAnimationFrame(() => {
      this.overlay.classList.add('open');
      const focusable = qsa('input, button, select, textarea, [tabindex]', this.modalEl)[0];
      focusable?.focus();
    });
  }

  close() {
    this.overlay.classList.remove('open');
    document.removeEventListener('keydown', this._handleKeydown);
    setTimeout(() => {
      this.overlay.remove();
      this._previousFocus?.focus?.();
      this.onClose?.();
    }, 150);
  }

  _handleKeydown(e) {
    if (e.key === 'Escape') {
      this.close();
      return;
    }
    if (e.key === 'Tab') this._trapFocus(e);
  }

  _trapFocus(e) {
    const focusables = qsa('input, button, select, textarea, [tabindex]', this.modalEl)
      .filter((node) => !node.disabled);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}