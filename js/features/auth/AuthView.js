/**
 * AuthView owns the full-page login screen markup (#authScreen in
 * index.html). One unified sign-in form now, not the old three-tab
 * admin/employee/sign-up split — every account has equal access once
 * signed in (see js/core/CurrentUser.js's removal / AuthController's own
 * note), so there's nothing left for the person to have to pick between.
 * AuthController tries both underlying sign-in mechanisms for them (see
 * its _handleSubmit) — whichever one matches their credentials, matches.
 *
 * There's still a second, secondary mode: 'sign-up', which creates the
 * one bootstrap administrator account (see AuthController). It's reached
 * via a small toggle link, not a tab, and that link is hidden outright
 * (AuthController.setSignUpAvailable) once an administrator already
 * exists — same reasoning as before, just no longer framed as one of a
 * set of equally-weighted tabs.
 */
export class AuthView {
  constructor(refs) {
    this.refs = refs;
    this.mode = 'sign-in';
    this._applyMode();

    this.refs.signUpToggle?.addEventListener('click', () => {
      this.setMode(this.mode === 'sign-up' ? 'sign-in' : 'sign-up');
    });

    // Same reveal-toggle pattern as ManageForm's #gPassword field (see
    // css/modal.css .password-field / .password-toggle).
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
   * ever shown) once adminAccountExists() resolves. Hiding the link
   * outright — not just disabling it — is deliberate: there's no
   * legitimate reason to keep it discoverable once the one bootstrap
   * administrator exists (see supabase/schema.sql's
   * admin_account_exists() comment).
   */
  setSignUpAvailable(available) {
    this.refs.signUpToggle.hidden = !available;
    if (!available && this.mode === 'sign-up') this.setMode('sign-in');
  }

  _applyMode() {
    const isSignUp = this.mode === 'sign-up';

    // Username only makes sense while creating a brand new administrator
    // (it becomes the display name) — sign-in never needs it.
    if (this.refs.usernameField) this.refs.usernameField.hidden = !isSignUp;
    if (this.refs.usernameInput) this.refs.usernameInput.required = isSignUp;

    this.refs.identifierInput.autocomplete = isSignUp ? 'email' : 'username';
    this.refs.submitBtn.textContent = isSignUp ? 'Create account' : 'Sign in';

    if (this.refs.sub) {
      this.refs.sub.textContent = isSignUp
        ? 'Create the  account'
        : "Sign in to manage your warehouse's assets.";
    }
    if (this.refs.signUpToggle) {
      this.refs.signUpToggle.textContent = isSignUp ? 'Back to sign in' : 'Set up the account';
    }
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
