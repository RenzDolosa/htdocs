import { el } from '../../utils/dom.js';

/**
 * AuthView owns the full-page login screen markup (already present in
 * index.html as #authScreen — this class just wires it up, the same
 * division of labor as ManageView/InventoryAssetView for their panels).
 *
 * Three modes, matching the (up to) three tabs:
 *   - 'admin'    — supabase.auth.signInWithPassword. Default tab.
 *   - 'employee' — SQL-only login (see js/core/Auth.js verifyEmployeeLogin
 *     + signInToEmployeePortal) — no Supabase Auth call, no email, no
 *     rate limit, however many employee accounts exist.
 *   - 'sign-up'  — creates the first (and only ever, by design — see
 *     AuthController) real administrator. Its tab is hidden entirely
 *     once one already exists (AuthController.setSignUpAvailable), not
 *     just disabled — there is deliberately no way back to it from the
 *     UI after that point.
 *
 * 'admin' and 'employee' are similar enough (one identifier + one
 * password) to share the same two input fields rather than duplicating
 * them per mode — only the identifier field's label/type and the
 * username field's visibility change between modes.
 */
export class AuthView {
  constructor(refs) {
    this.refs = refs;
    this.mode = 'admin';
    this._applyMode();

    this.refs.adminTab.addEventListener('click', () => this.setMode('admin'));
    this.refs.employeeTab.addEventListener('click', () => this.setMode('employee'));
    this.refs.signUpTab.addEventListener('click', () => this.setMode('sign-up'));

    // Same reveal-toggle pattern as ManageForm's #gPassword field (see
    // css/modal.css .password-field / .password-toggle) — one input/button
    // pair shared by every mode, since it's the same field.
    this.refs.passwordToggle?.addEventListener('click', (e) => {
      const input = this.refs.passwordInput;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      e.currentTarget.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  }

  setMode(mode) {
    this.mode = mode;
    this._applyMode();
    this.clearError();
  }

  /**
   * Called once at startup (AuthController.init, before the screen is
   * ever shown) once adminAccountExists() resolves. Hiding the tab
   * outright — not just disabling it — is deliberate: there's no
   * legitimate reason to keep it discoverable once the one bootstrap
   * administrator exists, per this feature's whole premise (see
   * supabase/schema.sql's admin_account_exists() comment).
   */
  setSignUpAvailable(available) {
    this.refs.signUpTab.hidden = !available;
    if (!available && this.mode === 'sign-up') this.setMode('admin');
  }

  _applyMode() {
    const isSignUp = this.mode === 'sign-up';
    const isEmployee = this.mode === 'employee';

    this.refs.adminTab.classList.toggle('is-active', this.mode === 'admin');
    this.refs.employeeTab.classList.toggle('is-active', isEmployee);
    this.refs.signUpTab.classList.toggle('is-active', isSignUp);

    // Username only makes sense while creating a brand new administrator
    // (it becomes the display name) — neither sign-in mode needs it, so
    // hide the whole field rather than just leaving it optional.
    if (this.refs.usernameField) this.refs.usernameField.hidden = !isSignUp;
    if (this.refs.usernameInput) this.refs.usernameInput.required = isSignUp;

    this.refs.identifierLabel.textContent = isEmployee ? 'Login account' : 'Email';
    this.refs.identifierInput.type = isEmployee ? 'text' : 'email';
    this.refs.identifierInput.placeholder = isEmployee ? 'e.g. maria@company.com' : 'you@company.com';
    this.refs.identifierInput.autocomplete = isSignUp ? 'email' : (isEmployee ? 'username' : 'email');

    const label = isSignUp ? 'Create account' : 'Sign in';
    this.refs.submitBtn.textContent = label;
    this.refs.switchHint.hidden = !isSignUp;
    this.refs.switchHint.textContent = 'Already have an account?';
  }

  getFormData() {
    return {
      username: this.refs.usernameInput?.value.trim() || '',
      identifier: this.refs.identifierInput.value.trim(),
      password: this.refs.passwordInput.value
    };
  }

  setLoading(isLoading) {
    this.refs.submitBtn.disabled = isLoading;
    this.refs.submitBtn.textContent = isLoading
      ? 'Please wait…'
      : (this.mode === 'sign-up' ? 'Create account' : 'Sign in');
  }

  showError(message) {
    this.refs.errorBox.textContent = message;
    this.refs.errorBox.hidden = false;
    this.refs.errorBox.classList.remove('auth-notice');
  }

  showNotice(message) {
    this.refs.errorBox.textContent = message;
    this.refs.errorBox.hidden = false;
    this.refs.errorBox.classList.add('auth-notice');
  }

  clearError() {
    this.refs.errorBox.hidden = true;
    this.refs.errorBox.classList.remove('auth-notice');
  }

  show() {
    this.refs.screen.hidden = false;
  }

  hide() {
    this.refs.screen.hidden = true;
  }
}