import { Modal } from '../../components/Modal.js';
import { Toast } from '../../components/Toast.js';
import { confirmDialog } from '../../components/ConfirmDialog.js';
import { openLogModal } from '../../components/LogModal.js';
import { buildFilterDropdown } from '../../components/FilterDropdown.js';
import { UserAccount } from '../../models/UserAccount.js';
import { buildUserAccountForm } from './UserAccountForm.js';
import { getOperatorName } from '../../core/Operator.js';

/**
 * UserAccountController drives Settings → User management → User: the
 * login-account grid shown in the reference app's User tab. Same
 * architecture split as ManageController — this owns filter/pagination
 * state and Store calls, UserAccountView owns rendering.
 */
export class UserAccountController {
  constructor({ store, userGroupStore, view, refs }) {
    this.store = store;
    this.userGroupStore = userGroupStore;
    this.view = view;
    this.refs = refs;

    this.state = {
      filters: { userNumber: '', username: '', loginAccount: '', enabled: 'all' },
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
    this._bindFilterBar();
    this._bindActionBar();
    this._bindFooterPageSizeDefault();
  }

  init() {
    this.render();
  }

  // ---------- Derived data ----------
  _filtered() {
    const f = this.state.filters;
    return this.store.list().filter((u) => {
      if (f.userNumber && !u.userNumber.toLowerCase().includes(f.userNumber.toLowerCase())) return false;
      if (f.username && !u.username.toLowerCase().includes(f.username.toLowerCase())) return false;
      if (f.loginAccount && !u.loginAccount.toLowerCase().includes(f.loginAccount.toLowerCase())) return false;
      if (f.enabled === 'enabled' && !u.enabled) return false;
      if (f.enabled === 'disabled' && u.enabled) return false;
      return true;
    }).sort((a, b) => b.createdAt - a.createdAt);
  }

  // ---------- Rendering ----------
  render() {
    const filtered = this._filtered();
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / this.state.pageSize));
    if (this.state.page > totalPages) this.state.page = totalPages;
    if (this.state.page < 1) this.state.page = 1;

    const start = (this.state.page - 1) * this.state.pageSize;
    const pageUsers = filtered.slice(start, start + this.state.pageSize);

    this.view.renderTable(pageUsers, {
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
    const user = this.store.get(id);
    if (!user) return;
    this.store.update(id, { enabled });
    user.addLogEntry(`${enabled ? 'Enabled' : 'Disabled'} account.`, enabled ? 'enable' : 'disable', null, getOperatorName());
    this.store.update(id, { history: user.history });
  }

  // ---------- Filter bar / action bar ----------
  _bindFilterBar() {
    const { filterUserNumber, filterUsername, filterLoginAccount, searchBtn, resetBtn } = this.refs;
    const applyOnEnter = (input) => input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._applyFilters(); });
    applyOnEnter(filterUserNumber);
    applyOnEnter(filterUsername);
    applyOnEnter(filterLoginAccount);
    searchBtn.addEventListener('click', () => this._applyFilters());
    resetBtn.addEventListener('click', () => this._resetFilters());
  }

  _applyFilters() {
    this.state.filters = {
      ...this.state.filters,
      userNumber: this.refs.filterUserNumber.value.trim(),
      username: this.refs.filterUsername.value.trim(),
      loginAccount: this.refs.filterLoginAccount.value.trim()
    };
    this.state.page = 1;
    this.render();
  }

  _resetFilters() {
    this.refs.filterUserNumber.value = '';
    this.refs.filterUsername.value = '';
    this.refs.filterLoginAccount.value = '';
    this.enabledDropdown.setValue(null);
    this.state.filters = { userNumber: '', username: '', loginAccount: '', enabled: 'all' };
    this.state.page = 1;
    this.render();
  }

  _bindActionBar() {
    this.refs.addUserBtn.addEventListener('click', () => this.openAddModal());
    this.refs.emptyAddBtn?.addEventListener('click', () => this.openAddModal());
    this.refs.viewLogBtn.addEventListener('click', () => this.viewLog());
  }

  // Page size select ships with 20 selected in the markup already; nothing to bind here beyond
  // what renderFooter wires per-render, but keeping the hook makes future defaults easy to change.
  _bindFooterPageSizeDefault() {}

  // ---------- Add / edit ----------
  openAddModal() {
    this._openUserModal(null);
  }

  openEditModal(id) {
    const user = this.store.get(id);
    if (!user) return;
    this._openUserModal(user);
  }

  _openUserModal(user) {
    const isEdit = !!user;
    const form = buildUserAccountForm(user, { userGroups: this.userGroupStore?.list() || [] });

    const footer = [
      { label: 'Cancel', variant: 'btn-outline', onClick: (m) => m.close() },
      {
        label: isEdit ? 'Save' : 'Add user',
        variant: 'btn-accent',
        onClick: (m) => {
          const data = form.getData();
          const { valid, errors } = UserAccount.validate(data, { existing: this.store.list(), editingId: user?.id || null });
          if (!valid) { form.showErrors(errors); Toast.error('Please fix the highlighted fields.'); return; }

          if (isEdit) {
            this.store.update(user.id, data);
            user.addLogEntry('Updated account details.', 'update', null, getOperatorName());
            this.store.update(user.id, { history: user.history });
            Toast.success('User saved.');
          } else {
            const created = this.store.create(data);
            created.addLogEntry('Account created.', 'create', null, getOperatorName());
            this.store.update(created.id, { history: created.history });
            Toast.success('User added.');
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
          const ok = await confirmDialog({
            title: 'Delete user?',
            message: `This removes "${user.username}" (${user.loginAccount}) and cannot be undone.`,
            confirmLabel: 'Delete',
            danger: true
          });
          if (!ok) return;
          this.store.delete(user.id);
          Toast.success('User deleted.');
          m.close();
        }
      });
    }

    const modal = new Modal({
      title: isEdit ? `Edit user — ${user.username}` : 'Add user',
      body: form.node,
      footer
    });
    modal.open();
    requestAnimationFrame(() => form.focusFirst());
  }

  // ---------- Activity log ----------
  viewLog() {
    const entries = this.store.list().flatMap((u) =>
      (u.history || []).map((entry) => ({ ...entry, message: `${u.username || u.loginAccount}: ${entry.message}` }))
    );
    openLogModal({ title: 'User management activity log', entries });
  }
}
