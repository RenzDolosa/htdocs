import { Modal } from '../../components/Modal.js';
import { Toast } from '../../components/Toast.js';
import { confirmDialog } from '../../components/ConfirmDialog.js';
import { openLogModal } from '../../components/LogModal.js';
import { buildFilterDropdown } from '../../components/FilterDropdown.js';
import { UserGroup } from '../../models/UserGroup.js';
import { buildUserGroupForm } from './UserGroupForm.js';
import { getOperatorName } from '../../core/Operator.js';

/**
 * UserGroupController drives Settings → User management → User group: the
 * role grid shown in the reference app's User Group tab, plus its add/edit
 * modal (Basic Information + a default menu permission tree). Same
 * architecture split as UserAccountController — this owns filter/
 * pagination state and Store calls, UserGroupView owns rendering.
 *
 * UserAccount.userGroup stays a plain free-text field (no schema change
 * there) — a user "belongs" to a group purely by that string matching a
 * UserGroup's name. _boundUsernames() is what resolves that match for the
 * grid's "Bound user" column; nothing here writes back to userAccountStore.
 */
export class UserGroupController {
  constructor({ store, userAccountStore, view, refs }) {
    this.store = store;
    this.userAccountStore = userAccountStore;
    this.view = view;
    this.refs = refs;

    this.state = {
      filters: { groupNumber: '', name: '', enabled: 'all' },
      page: 1,
      pageSize: 20
    };

    this.enabledDropdown = buildFilterDropdown({
      placeholder: 'Whether to enable',
      options: [{ value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }],
      onSelect: (value) => { this.state.filters.enabled = value; this.state.page = 1; this.render(); }
    });
    this.refs.enabledFilterMount.appendChild(this.enabledDropdown.node);

    this.store.on('change', () => this.render());
    this.userAccountStore.on('change', () => this.render()); // a username edit/rename should refresh "Bound user"
    this._bindFilterBar();
    this._bindActionBar();
  }

  init() {
    this.render();
  }

  // ---------- Derived data ----------
  _filtered() {
    const f = this.state.filters;
    return this.store.list().filter((g) => {
      if (f.groupNumber && !g.groupNumber.toLowerCase().includes(f.groupNumber.toLowerCase())) return false;
      if (f.name && !g.name.toLowerCase().includes(f.name.toLowerCase())) return false;
      if (f.enabled === 'enabled' && !g.enabled) return false;
      if (f.enabled === 'disabled' && g.enabled) return false;
      return true;
    }).sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Usernames of every UserAccount whose free-text userGroup matches this group's name (trimmed, case-sensitive — same as how the User form stores it verbatim). */
  _boundUsernames(group) {
    return this.userAccountStore.list()
      .filter((u) => (u.userGroup || '').trim() === group.name.trim())
      .map((u) => u.username);
  }

  // ---------- Rendering ----------
  render() {
    const filtered = this._filtered();
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / this.state.pageSize));
    if (this.state.page > totalPages) this.state.page = totalPages;
    if (this.state.page < 1) this.state.page = 1;

    const start = (this.state.page - 1) * this.state.pageSize;
    const pageGroups = filtered.slice(start, start + this.state.pageSize)
      .map((g) => ({ ...g, boundUsernames: this._boundUsernames(g) }));

    this.view.renderTable(pageGroups, {
      onEdit: (id) => this.openEditModal(id),
      onToggleEnabled: (id, enabled) => this._toggleEnabled(id, enabled)
    });
    this.view.renderFooter(
      { totalItems, page: this.state.page, pageSize: this.state.pageSize, totalPages },
      {
        onPrevPage: () => this._goToPage(this.state.page - 1),
        onNextPage: () => this._goToPage(this.state.page + 1),
        onPageClick: (page) => this._goToPage(page),
        onPageSizeChange: (size) => { this.state.pageSize = size; this.state.page = 1; this.render(); },
        onGotoPage: (page) => this._goToPage(page)
      }
    );
  }

  _goToPage(page) {
    this.state.page = page;
    this.render();
  }

  _toggleEnabled(id, enabled) {
    const group = this.store.get(id);
    if (!group) return;
    this.store.update(id, { enabled });
    group.addLogEntry(`${enabled ? 'Enabled' : 'Disabled'} user group.`, enabled ? 'enable' : 'disable', null, getOperatorName());
    this.store.update(id, { history: group.history });
  }

  // ---------- Filter bar / action bar ----------
  _bindFilterBar() {
    const { filterGroupNumber, filterName, searchBtn, resetBtn } = this.refs;
    const applyOnEnter = (input) => input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._applyFilters(); });
    applyOnEnter(filterGroupNumber);
    applyOnEnter(filterName);
    searchBtn.addEventListener('click', () => this._applyFilters());
    resetBtn.addEventListener('click', () => this._resetFilters());
  }

  _applyFilters() {
    this.state.filters = {
      ...this.state.filters,
      groupNumber: this.refs.filterGroupNumber.value.trim(),
      name: this.refs.filterName.value.trim()
    };
    this.state.page = 1;
    this.render();
  }

  _resetFilters() {
    this.refs.filterGroupNumber.value = '';
    this.refs.filterName.value = '';
    this.enabledDropdown.setValue(null);
    this.state.filters = { groupNumber: '', name: '', enabled: 'all' };
    this.state.page = 1;
    this.render();
  }

  _bindActionBar() {
    this.refs.addGroupBtn.addEventListener('click', () => this.openAddModal());
    this.refs.emptyAddBtn?.addEventListener('click', () => this.openAddModal());
    this.refs.viewLogBtn.addEventListener('click', () => this.viewLog());
  }

  // ---------- Add / edit ----------
  openAddModal() {
    this._openGroupModal(null);
  }

  openEditModal(id) {
    const group = this.store.get(id);
    if (!group) return;
    this._openGroupModal(group);
  }

  _openGroupModal(group) {
    const isEdit = !!group;
    const form = buildUserGroupForm(group);

    const footer = [
      { label: 'Cancel', variant: 'btn-outline', onClick: (m) => m.close() },
      {
        label: isEdit ? 'Save' : 'Add',
        variant: 'btn-accent',
        onClick: (m) => {
          const data = form.getData();
          const { valid, errors } = UserGroup.validate(data, { existing: this.store.list(), editingId: group?.id || null });
          if (!valid) { form.showErrors(errors); Toast.error('Please fix the highlighted fields.'); return; }

          if (isEdit) {
            this.store.update(group.id, data);
            group.addLogEntry('Updated user group details and permissions.', 'update', null, getOperatorName());
            this.store.update(group.id, { history: group.history });
            Toast.success('User group saved.');
          } else {
            const created = this.store.create(data);
            created.addLogEntry('User group created.', 'create', null, getOperatorName());
            this.store.update(created.id, { history: created.history });
            Toast.success('User group added.');
          }
          m.close();
        }
      }
    ];
    if (isEdit) {
      footer.splice(1, 0, {
        label: 'Delete',
        variant: 'btn-danger',
        onClick: async (m) => {
          const bound = this._boundUsernames(group);
          const ok = await confirmDialog({
            title: 'Delete user group?',
            message: bound.length
              ? `This removes "${group.name}" and cannot be undone. ${bound.length} user${bound.length === 1 ? '' : 's'} currently listed under it (${bound.join(', ')}) will keep that group name as plain text but it will no longer match a real group.`
              : `This removes "${group.name}" and cannot be undone.`,
            confirmLabel: 'Delete',
            danger: true
          });
          if (!ok) return;
          this.store.delete(group.id);
          Toast.success('User group deleted.');
          m.close();
        }
      });
    }

    const modal = new Modal({
      title: isEdit ? `Edit user group — ${group.name}` : 'Add a new user group',
      body: form.node,
      footer,
      size: 'md'
    });
    modal.open();
    requestAnimationFrame(() => form.focusFirst());
  }

  // ---------- Activity log ----------
  viewLog() {
    const entries = this.store.list().flatMap((g) =>
      (g.history || []).map((entry) => ({ ...entry, message: `${g.name}: ${entry.message}` }))
    );
    openLogModal({ title: 'User group activity log', entries });
  }
}
