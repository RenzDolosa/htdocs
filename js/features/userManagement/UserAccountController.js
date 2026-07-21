// import { Modal } from '../../components/Modal.js';
// import { Toast } from '../../components/Toast.js';
// import { confirmDialog } from '../../components/ConfirmDialog.js';
// import { openLogModal } from '../../components/LogModal.js';
// import { buildFilterDropdown } from '../../components/FilterDropdown.js';
// import { UserAccount } from '../../models/UserAccount.js';
// import { buildUserAccountForm } from './UserAccountForm.js';
// import { getOperatorName } from '../../core/Operator.js';
// import { adminCreateAccount, sendPasswordReset } from '../../core/Auth.js';
// import { supabase } from '../../core/supabaseClient.js';
// import { generateId } from '../../utils/id.js';

// const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// /**
//  * UserAccountController drives Settings → User management → User: the
//  * login-account grid shown in the reference app's User tab. Same
//  * architecture split as ManageController — this owns filter/pagination
//  * state and Store calls, UserAccountView owns rendering.
//  */
// export class UserAccountController {
//   constructor({ store, userGroupStore, view, refs }) {
//     this.store = store;
//     this.userGroupStore = userGroupStore;
//     this.view = view;
//     this.refs = refs;

//     this.state = {
//       filters: { userNumber: '', username: '', loginAccount: '', enabled: 'all' },
//       page: 1,
//       pageSize: 20
//     };

//     this.enabledDropdown = buildFilterDropdown({
//       placeholder: 'Whether to enable',
//       options: [{ value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }],
//       onSelect: (value) => { this.state.filters.enabled = value; this.state.page = 1; this.render(); }
//     });
//     this.refs.enabledFilterMount.appendChild(this.enabledDropdown.node);

//     this.store.on('change', () => this.render());
//     this._bindFilterBar();
//     this._bindActionBar();
//     this._bindFooterPageSizeDefault();
//   }

//   init() {
//     this.render();
//   }

//   // ---------- Derived data ----------
//   _filtered() {
//     const f = this.state.filters;
//     return this.store.list().filter((u) => {
//       if (f.userNumber && !u.userNumber.toLowerCase().includes(f.userNumber.toLowerCase())) return false;
//       if (f.username && !u.username.toLowerCase().includes(f.username.toLowerCase())) return false;
//       if (f.loginAccount && !u.loginAccount.toLowerCase().includes(f.loginAccount.toLowerCase())) return false;
//       if (f.enabled === 'enabled' && !u.enabled) return false;
//       if (f.enabled === 'disabled' && u.enabled) return false;
//       return true;
//     }).sort((a, b) => b.createdAt - a.createdAt);
//   }

//   // ---------- Rendering ----------
//   render() {
//     const filtered = this._filtered();
//     const totalItems = filtered.length;
//     const totalPages = Math.max(1, Math.ceil(totalItems / this.state.pageSize));
//     if (this.state.page > totalPages) this.state.page = totalPages;
//     if (this.state.page < 1) this.state.page = 1;

//     const start = (this.state.page - 1) * this.state.pageSize;
//     const pageUsers = filtered.slice(start, start + this.state.pageSize);

//     this.view.renderTable(pageUsers, {
//       onEdit: (id) => this.openEditModal(id),
//       onToggleEnabled: (id, enabled) => this._toggleEnabled(id, enabled)
//     });
//     this.view.renderFooter(
//       { totalItems, page: this.state.page, pageSize: this.state.pageSize, totalPages },
//       {
//         onPrevPage: () => this._goToPage(this.state.page - 1),
//         onNextPage: () => this._goToPage(this.state.page + 1),
//         onPageClick: (page) => this._goToPage(page),
//         onPageSizeChange: (size) => { this.state.pageSize = size; this.state.page = 1; this.render(); },
//         onGotoPage: (page) => this._goToPage(page)
//       }
//     );
//   }

//   _goToPage(page) {
//     this.state.page = page;
//     this.render();
//   }

//   _toggleEnabled(id, enabled) {
//     const user = this.store.get(id);
//     if (!user) return;
//     this.store.update(id, { enabled });
//     user.addLogEntry(`${enabled ? 'Enabled' : 'Disabled'} account.`, enabled ? 'enable' : 'disable', null, getOperatorName());
//     this.store.update(id, { history: user.history });
//   }

//   // ---------- Filter bar / action bar ----------
//   _bindFilterBar() {
//     const { filterUserNumber, filterUsername, filterLoginAccount, searchBtn, resetBtn } = this.refs;
//     const applyOnEnter = (input) => input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._applyFilters(); });
//     applyOnEnter(filterUserNumber);
//     applyOnEnter(filterUsername);
//     applyOnEnter(filterLoginAccount);
//     searchBtn.addEventListener('click', () => this._applyFilters());
//     resetBtn.addEventListener('click', () => this._resetFilters());
//   }

//   _applyFilters() {
//     this.state.filters = {
//       ...this.state.filters,
//       userNumber: this.refs.filterUserNumber.value.trim(),
//       username: this.refs.filterUsername.value.trim(),
//       loginAccount: this.refs.filterLoginAccount.value.trim()
//     };
//     this.state.page = 1;
//     this.render();
//   }

//   _resetFilters() {
//     this.refs.filterUserNumber.value = '';
//     this.refs.filterUsername.value = '';
//     this.refs.filterLoginAccount.value = '';
//     this.enabledDropdown.setValue(null);
//     this.state.filters = { userNumber: '', username: '', loginAccount: '', enabled: 'all' };
//     this.state.page = 1;
//     this.render();
//   }

//   _bindActionBar() {
//     this.refs.addUserBtn.addEventListener('click', () => this.openAddModal());
//     this.refs.emptyAddBtn?.addEventListener('click', () => this.openAddModal());
//     this.refs.viewLogBtn.addEventListener('click', () => this.viewLog());
//   }

//   // Page size select ships with 20 selected in the markup already; nothing to bind here beyond
//   // what renderFooter wires per-render, but keeping the hook makes future defaults easy to change.
//   _bindFooterPageSizeDefault() {}

//   // ---------- Add / edit ----------
//   openAddModal() {
//     this._openUserModal(null);
//   }

//   openEditModal(id) {
//     const user = this.store.get(id);
//     if (!user) return;
//     this._openUserModal(user);
//   }

//   _openUserModal(user) {
//     const isEdit = !!user;
//     const isLinked = !!user?.authUserId;
//     // Password fields render in the form whenever there's a real sign-in
//     // to create or claim: always on Add, and on Edit only for a
//     // directory-only row that hasn't been claimed by a real account yet
//     // (see UserAccountForm.js). An already-linked account never gets a
//     // raw password field — that's handled by the reset-email button below.
//     const showsPasswordFields = !isEdit || !isLinked;
//     const form = buildUserAccountForm(user, { userGroups: this.userGroupStore?.list() || [] });

//     const footer = [
//       { label: 'Cancel', variant: 'btn-outline', onClick: (m) => m.close() },
//       {
//         label: isEdit ? 'Save' : 'Add user',
//         variant: 'btn-accent',
//         onClick: async (m) => {
//           const data = form.getData();
//           const { valid, errors } = UserAccount.validate(data, { existing: this.store.list(), editingId: user?.id || null });

//           // Password validation: required on Add, optional-but-must-be-valid
//           // on Edit (an unlinked row can be saved with no password — it just
//           // stays a directory entry — but if either field has anything in
//           // it, both need to be there, long enough, and matching).
//           let password = '';
//           if (showsPasswordFields) {
//             const touchedPassword = !isEdit || data.password || data.confirmPassword;
//             if (touchedPassword) {
//               if (!data.password || data.password.length < 6) errors.password = 'Password must be at least 6 characters.';
//               if (data.confirmPassword !== data.password) errors.confirmPassword = 'Passwords do not match.';
//               password = data.password;
//             }
//           }
//           // loginAccount becomes a real Supabase Auth email the moment a
//           // password is involved — the app-wide "any non-empty string"
//           // rule (UserAccount.validate) isn't strict enough for that.
//           if (password && !EMAIL_PATTERN.test(data.loginAccount)) {
//             errors.loginAccount = 'Enter a valid email — this becomes their sign-in address.';
//           }

//           if (!valid || Object.keys(errors).length) { form.showErrors(errors); Toast.error('Please fix the highlighted fields.'); return; }

//           const directoryPatch = {
//             username: data.username,
//             loginAccount: data.loginAccount,
//             userGroup: data.userGroup,
//             phoneNumber: data.phoneNumber,
//             mail: data.mail,
//             enabled: data.enabled
//           };

//           if (isEdit) {
//             this.store.update(user.id, directoryPatch);
//             user.addLogEntry('Updated account details.', 'update', null, getOperatorName());
//             this.store.update(user.id, { history: user.history });

//             if (password) {
//               const { needsEmailConfirmation, error } = await adminCreateAccount({ email: data.loginAccount, password, username: data.username });
//               if (error) {
//                 Toast.error(`Directory details saved, but creating sign-in credentials failed: ${error.message}`);
//                 m.close();
//                 return;
//               }
//               Toast.success(needsEmailConfirmation
//                 ? 'Saved. Sign-in created — they need to confirm their email before they can log in.'
//                 : 'Saved — this account can now sign in.');
//             } else {
//               Toast.success('User saved.');
//             }
//             m.close();
//           } else {
//             const { userId, needsEmailConfirmation, error } = await adminCreateAccount({ email: data.loginAccount, password, username: data.username });
//             if (error) {
//               if (/already|registered/i.test(error.message || '')) form.showErrors({ loginAccount: 'This email is already registered.' });
//               Toast.error(error.message || 'Could not create the account.');
//               return;
//             }
//             // The auth.users → user_accounts trigger (supabase/schema.sql)
//             // already created the linked row with username/email — this
//             // fills in the extra directory fields it has no way to know
//             // about (group, phone, contact mail, enabled state).
//             if (userId) {
//               const entry = { id: generateId('log'), type: 'create', message: 'Account created.', timestamp: Date.now(), performedBy: getOperatorName() };
//               const { error: patchError } = await supabase.from('user_accounts').update({
//                 userGroup: data.userGroup,
//                 phoneNumber: data.phoneNumber,
//                 mail: data.mail || data.loginAccount,
//                 enabled: data.enabled,
//                 history: [entry]
//               }).eq('authUserId', userId);
//               if (patchError) console.error('UserAccountController: post-signup directory update failed', patchError);
//             }
//             Toast.success(needsEmailConfirmation
//               ? 'Account created — they need to confirm their email before they can sign in.'
//               : 'User added and can sign in now.');
//             m.close();
//           }
//         }
//       }
//     ];
//     if (isEdit && isLinked) {
//       footer.splice(1, 0, {
//         label: 'Send password reset email',
//         variant: 'btn-outline',
//         onClick: async (m) => {
//           const { error } = await sendPasswordReset(user.loginAccount);
//           if (error) { Toast.error(error.message || 'Could not send the reset email.'); return; }
//           Toast.success(`Password reset email sent to ${user.loginAccount}.`);
//         }
//       });
//     }
//     if (isEdit) {
//       footer.splice(1, 0, {
//         label: 'Delete',
//         variant: 'btn-danger',
//         onClick: async (m) => {
//           const ok = await confirmDialog({
//             title: 'Delete user?',
//             message: user.authUserId
//               ? `This removes "${user.username}" (${user.loginAccount}) from this directory and cannot be undone. It does not revoke their Supabase Auth sign-in — they'll still be able to log into the app, they just won't appear in this list anymore.`
//               : `This removes "${user.username}" (${user.loginAccount}) and cannot be undone.`,
//             confirmLabel: 'Delete',
//             danger: true
//           });
//           if (!ok) return;
//           this.store.delete(user.id);
//           Toast.success('User deleted.');
//           m.close();
//         }
//       });
//     }

//     const modal = new Modal({
//       title: isEdit ? `Edit user — ${user.username}` : 'Add user',
//       body: form.node,
//       footer
//     });
//     modal.open();
//     requestAnimationFrame(() => form.focusFirst());
//   }

//   // ---------- Activity log ----------
//   viewLog() {
//     const entries = this.store.list().flatMap((u) =>
//       (u.history || []).map((entry) => ({ ...entry, message: `${u.username || u.loginAccount}: ${entry.message}` }))
//     );
//     openLogModal({ title: 'User management activity log', entries });
//   }
// }
