import { el } from '../../utils/dom.js';
import { buildFilterDropdown } from '../../components/FilterDropdown.js';

/**
 * Builds the add/edit user form as a detached DOM node — same
 * { node, getData, showErrors, focusFirst } shape as buildWarehouseForm /
 * buildManageForm, so ManageController-style modal wiring drops in as-is.
 *
 * `userGroups` (UserGroup[], from UserGroupController's store) drives the
 * "User group" field: it's rendered as the same select-style dropdown used
 * for filter bars (see FilterDropdown.js) instead of free text, so a user
 * can only be placed into a group that actually exists. The stored value
 * is the group's real id (UserAccount.userGroupId, a foreign key into
 * UserGroup — see supabase/schema.sql), not its name, so a later rename
 * doesn't silently break the assignment.
 */
export function buildUserAccountForm(user = null, { userGroups = [] } = {}) {
  const isLinked = !!user?.authUserId;
  // Add mode: a password here becomes this employee's SQL-stored sign-in
  // credential (see UserAccountController._openUserModal's
  // setEmployeePassword call — supabase/schema.sql's employee_credentials
  // table, not Supabase Auth) — optional, since a directory-only row is
  // still useful without one. On Edit, the same fields let an existing
  // employee row get (or change) a password. "isLinked" now means a real
  // Supabase Auth administrator (see AUTH_GUIDE.md) — those never get a
  // raw password field here; there's no client-safe way to set someone
  // else's existing Supabase Auth password directly (see Auth.js
  // sendPasswordReset, wired up as a footer button instead).
  const showPasswordFields = !user || !isLinked;

  const node = el(`
    <form class="gadget-form" novalidate>
      <!-- ${isLinked ? `
      <p class="hint" style="margin: -4px 0 14px;">
        This is a real Supabase Auth account (linked automatically when it signed up) — editing
        the fields below only updates this directory entry, not their actual sign-in email or
        password. Use "Send password reset email" below to let them set a new one.
      </p>` : ''} -->
      <div class="field-row">
        <div class="field">
          <label for="uaUsername">Username <span class="required-mark">*</span></label>
          <input type="text" id="uaUsername" name="username" placeholder="e.g. Maria Santos">
          <div class="field-error" data-error-for="username"></div>
        </div>
        <div class="field">
          <label for="uaLoginAccount">Login account <span class="required-mark">*</span></label>
          <input type="text" id="uaLoginAccount" name="loginAccount" placeholder="e.g. maria@company.com" ${isLinked ? 'disabled' : ''}>
          <div class="field-error" data-error-for="loginAccount"></div>
        </div>
      </div>

      ${showPasswordFields ? `
      <div class="field-row">
        <div class="field">
          <label for="uaPassword">Password</label>
          <div class="password-field">
            <input type="password" id="uaPassword" name="password" autocomplete="new-password" placeholder="••••••••">
            <button tabindex="-1" type="button" class="password-toggle" data-action="toggle-ua-password" aria-label="Show password">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
          <div class="field-error" data-error-for="password"></div>
        </div>
        <div class="field">
          <label for="uaConfirmPassword">Confirm password</label>
          <div class="password-field">
            <input type="password" id="uaConfirmPassword" name="confirmPassword" autocomplete="new-password" placeholder="••••••••">
            <button tabindex="-1" type="button" class="password-toggle" data-action="toggle-ua-confirm-password" aria-label="Show password">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
          <div class="field-error" data-error-for="confirmPassword"></div>
        </div>
      </div>
      <p class="hint" style="margin: -8px 0 14px;">${user
        ? 'Optional — set a password to let this employee sign in via "Login as Employee". Leave both blank to just update the directory details below.'
        : 'Optional — set a password now to let this employee sign in right away via "Login as Employee", or leave both blank and set one later.'}</p>
      ` : ''}

      <div class="field-row">
        <div class="field">
          <label for="uaUserGroup">User group</label>
          <div id="uaUserGroupMount"></div>
        </div>
        <div class="field">
          <label for="uaPhone">Phone number</label>
          <input type="text" id="uaPhone" name="phoneNumber" placeholder="e.g. 09171234567">
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label for="uaMail">Mail</label>
          <input type="text" id="uaMail" name="mail" placeholder="e.g. maria@company.com">
        </div>
        <div class="field">
          <label>&nbsp;</label>
          <label class="checkbox-inline"><input type="checkbox" tabindex="-1" id="uaEnabled" name="enabled"> Enabled</label>
        </div>
      </div>
    </form>
  `);

  node.querySelector('[data-action="toggle-ua-password"]')?.addEventListener('click', (e) => {
    const input = node.querySelector('#uaPassword');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    e.currentTarget.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });
  node.querySelector('[data-action="toggle-ua-confirm-password"]')?.addEventListener('click', (e) => {
    const input = node.querySelector('#uaConfirmPassword');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    e.currentTarget.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });

  node.querySelector('#uaUsername').value = user?.username || '';
  node.querySelector('#uaLoginAccount').value = user?.loginAccount || '';
  node.querySelector('#uaPhone').value = user?.phoneNumber || '';
  node.querySelector('#uaMail').value = user?.mail || '';
  node.querySelector('#uaEnabled').checked = user ? user.enabled : true;

  // ---- User group dropdown ----
  // Options come from real UserGroup records, plus an explicit "No user
  // group" choice (so a group can be un-assigned rather than only ever
  // assigned). If the account's userGroupId somehow doesn't match any
  // real group (the FK's `on delete set null` should prevent this in
  // normal operation, but a stale id from an older export/import isn't
  // impossible), that value is kept as a one-off option instead of
  // silently being wiped on open.
  const currentGroupId = user?.userGroupId || '';
  const groupOptions = [
    { value: '', label: 'No user group' },
    ...userGroups.map((g) => ({ value: g.id, label: g.enabled ? g.name : `${g.name} (disabled)` }))
  ];
  if (currentGroupId && !userGroups.some((g) => g.id === currentGroupId)) {
    groupOptions.push({ value: currentGroupId, label: 'Unknown group (not found)' });
  }

  let userGroupIdValue = currentGroupId;
  const groupDropdown = buildFilterDropdown({
    placeholder: 'Select a user group',
    options: groupOptions,
    onSelect: (value) => { userGroupIdValue = value; }
  });
  groupDropdown.node.id = 'uaUserGroup';
  // Editing an existing account always shows its actual state, including
  // the explicit "No user group" option. A brand-new user starts on the
  // placeholder instead, so an untouched dropdown doesn't read as if
  // "No user group" had already been deliberately chosen.
  if (user) groupDropdown.setValue(currentGroupId);
  node.querySelector('#uaUserGroupMount').replaceWith(groupDropdown.node);

  function getData() {
    return {
      username: node.querySelector('#uaUsername').value.trim(),
      loginAccount: node.querySelector('#uaLoginAccount').value.trim(),
      password: node.querySelector('#uaPassword')?.value || '',
      confirmPassword: node.querySelector('#uaConfirmPassword')?.value || '',
      userGroupId: userGroupIdValue || null,
      phoneNumber: node.querySelector('#uaPhone').value.trim(),
      mail: node.querySelector('#uaMail').value.trim(),
      enabled: node.querySelector('#uaEnabled').checked
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
    node.querySelector('#uaUsername')?.focus();
  }

  return { node, getData, showErrors, focusFirst };
}