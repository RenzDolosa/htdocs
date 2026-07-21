import { el, esc } from '../../utils/dom.js';
import { PERMISSION_TREE, defaultPermissions } from '../../models/UserGroup.js';

/**
 * Builds the add/edit user group form as a detached DOM node — same
 * { node, getData, showErrors, focusFirst } shape as buildUserAccountForm /
 * buildWarehouseForm, so the same Modal wiring drops in as-is.
 *
 * The permission tree is self-contained: it owns its own local
 * `permissions` map (seeded from the group being edited, or all-denied for
 * a new one) and re-renders itself on every toggle/search/expand click.
 * getData() reads that map at submit time — nothing here touches a Store.
 */
export function buildUserGroupForm(group = null) {
  const node = el(`
    <form class="gadget-form" novalidate>
      <div class="field-row">
        <div class="field">
          <label for="ugName">User group name <span class="required-mark">*</span></label>
          <input type="text" id="ugName" name="name" placeholder="e.g. Warehouse Associate">
          <div class="field-error" data-error-for="name"></div>
        </div>
        <div class="field">
          <label>&nbsp;</label>
          <label class="checkbox-inline"><input type="checkbox" tabindex="-1" id="ugEnabled" name="enabled"> Enabled</label>
        </div>
      </div>

      <div class="field">
        <label>Default menu permissions</label>
        <div class="perm-tree-toolbar">
          <input type="text" id="ugPermSearch" placeholder="Menu name">
          <button tabindex="-1" type="button" class="btn btn-outline btn-sm" data-action="expand-all">Show</button>
          <button tabindex="-1" type="button" class="btn btn-outline btn-sm" data-action="collapse-all">Fold</button>
        </div>
        <div tabindex="-1" class="perm-tree" id="ugPermTree"></div>
      </div>
    </form>
  `);

  node.querySelector('#ugName').value = group?.name || '';
  node.querySelector('#ugEnabled').checked = group ? group.enabled : true;

  // Local, mutable working copy — only written back into the record on Save/Add.
  const permissions = { ...defaultPermissions(), ...(group?.permissions || {}) };
  const collapsedKeys = new Set();
  const treeEl = node.querySelector('#ugPermTree');

  function nodeMatches(n, query) {
    if (!query) return true;
    if (n.label.toLowerCase().includes(query)) return true;
    return (n.children || []).some((c) => nodeMatches(c, query));
  }

  function renderNode(n, depth, query) {
    if (!nodeMatches(n, query)) return null;
    const hasChildren = !!(n.children && n.children.length);
    const isCollapsed = collapsedKeys.has(n.key);
    const allowed = !!permissions[n.key];

    const row = el(`
      <div class="perm-row" style="padding-left:${depth * 20 + 10}px">
        ${hasChildren
          ? `<button tabindex="-1" type="button" class="perm-caret${isCollapsed ? ' collapsed' : ''}" data-toggle-key="${n.key}">▾</button>`
          : `<span class="perm-caret-spacer"></span>`}
        <span class="perm-label">${esc(n.label)}</span>
        <button tabindex="-1" type="button" class="perm-toggle ${allowed ? 'allow' : 'deny'}" data-perm-key="${n.key}">
          <span class="perm-dot"></span><span class="perm-toggle-label">${allowed ? 'Allow' : 'Not allow'}</span>
        </button>
      </div>
    `);

    row.querySelector('[data-perm-key]').addEventListener('click', (e) => {
      const key = e.currentTarget.getAttribute('data-perm-key');
      permissions[key] = !permissions[key];
      renderTree();
    });

    const caretBtn = row.querySelector('[data-toggle-key]');
    caretBtn?.addEventListener('click', () => {
      if (collapsedKeys.has(n.key)) collapsedKeys.delete(n.key); else collapsedKeys.add(n.key);
      renderTree();
    });

    const wrap = el(`<div class="perm-node"></div>`);
    wrap.appendChild(row);

    if (hasChildren && !isCollapsed) {
      n.children.forEach((child) => {
        const childEl = renderNode(child, depth + 1, query);
        if (childEl) wrap.appendChild(childEl);
      });
    }
    return wrap;
  }

  function renderTree() {
    const query = node.querySelector('#ugPermSearch').value.trim().toLowerCase();
    treeEl.innerHTML = '';
    PERMISSION_TREE.forEach((n) => {
      const rendered = renderNode(n, 0, query);
      if (rendered) treeEl.appendChild(rendered);
    });
  }

  node.querySelector('#ugPermSearch').addEventListener('input', renderTree);
  node.querySelector('[data-action="expand-all"]').addEventListener('click', () => { collapsedKeys.clear(); renderTree(); });
  node.querySelector('[data-action="collapse-all"]').addEventListener('click', () => {
    (function collectParents(nodes) {
      nodes.forEach((n) => { if (n.children) { collapsedKeys.add(n.key); collectParents(n.children); } });
    })(PERMISSION_TREE);
    renderTree();
  });

  renderTree();

  function getData() {
    return {
      name: node.querySelector('#ugName').value.trim(),
      enabled: node.querySelector('#ugEnabled').checked,
      permissions: { ...permissions }
    };
  }

  function showErrors(errors) {
    node.querySelectorAll('[data-error-for]').forEach((n) => { n.textContent = ''; });
    node.querySelectorAll('input.invalid').forEach((n) => n.classList.remove('invalid'));
    Object.entries(errors).forEach(([field, message]) => {
      const errorEl = node.querySelector(`[data-error-for="${field}"]`);
      if (errorEl) errorEl.textContent = message;
      node.querySelector(`[name="${field}"]`)?.classList.add('invalid');
    });
  }

  function focusFirst() {
    node.querySelector('#ugName')?.focus();
  }

  return { node, getData, showErrors, focusFirst };
}
