/**
 * Small DOM helpers used across components and features.
 * Kept dependency-free so any module can import from here without cycles.
 */

/** Shorthand querySelector scoped to a root (defaults to document). */
export function qs(selector, root = document) {
  return root.querySelector(selector);
}

/** Shorthand querySelectorAll returning a real array. */
export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/** Escape untrusted text before interpolating into innerHTML strings. */
export function esc(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

/**
 * Build a real DOM element from an HTML string.
 * Convenience for components that construct their markup as a template literal.
 */
export function el(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

/** Attach multiple event listeners at once: on(node, { click: fn, input: fn }) */
export function on(node, handlers) {
  Object.entries(handlers).forEach(([event, handler]) => {
    node.addEventListener(event, handler);
  });
}