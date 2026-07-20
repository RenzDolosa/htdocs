import {
  getSession, onAuthStateChange, signInWithPassword, signUp, signOut,
  isAccountEnabled, verifyEmployeeLogin, signInToEmployeePortal, adminAccountExists
} from '../../core/Auth.js';
import { getOperatorName, setOperatorName } from '../../core/Operator.js';
import { setEmployeeProfile, getEmployeeProfile, clearEmployeeProfile } from '../../core/EmployeeSession.js';
import { EMPLOYEE_PORTAL_EMAIL } from '../../core/supabaseConfig.js';

/**
 * AuthController is the gatekeeper in front of the rest of the app, for
 * all three of AuthView's modes:
 *   - 'admin'    — a real Supabase Auth session (auth.users).
 *   - 'employee' — verifyEmployeeLogin() checks a SQL-stored password
 *     (never touches Supabase Auth, so it never counts against the email
 *     rate limit), then signInToEmployeePortal() signs the browser into
 *     one shared Supabase Auth account just to satisfy RLS. Which
 *     employee is actually signed in is tracked separately via
 *     EmployeeSession — see core/EmployeeSession.js's own doc comment.
 *   - 'sign-up'  — creates the one bootstrap administrator. Hidden
 *     entirely (not just disabled) once adminAccountExists() is true —
 *     see AuthView.setSignUpAvailable and schema.sql's
 *     admin_account_exists().
 *
 * `onSignedIn(session)` is supplied by app.js and does the actual app
 * bootstrap (constructing stores, controllers, etc.) — AuthController
 * itself knows nothing about gadgets, warehouses, or any other feature.
 */
export class AuthController {
  constructor({ view, refs, onSignedIn, onSignedOut }) {
    this.view = view;
    this.refs = refs;
    this.onSignedIn = onSignedIn;
    this.onSignedOut = onSignedOut;
    this._appStarted = false;
  }

  async init() {
    this.refs.form.addEventListener('submit', (e) => this._handleSubmit(e));
    this.refs.signOutBtn?.addEventListener('click', async () => {
      await signOut();
      // Otherwise the next person to sign in on this browser — employee
      // portal session or not — would inherit whoever signed out's name
      // until their own successful employee sign-in overwrites it.
      clearEmployeeProfile();
    });

    // Resolved before the login screen can possibly be shown (both branches
    // of _handleSessionChange below run after this), so there's no flash
    // of a sign-up tab that then disappears.
    const anAdminAlreadyExists = await adminAccountExists();
    this.view.setSignUpAvailable(!anAdminAlreadyExists);

    onAuthStateChange((session) => this._handleSessionChange(session));

    const session = await getSession();
    await this._handleSessionChange(session);
  }

  async _handleSessionChange(session) {
    if (session) {
      // Every employee's browser signs into the exact same shared Supabase
      // Auth account (see supabaseConfig.js's EMPLOYEE_PORTAL_EMAIL) — its
      // session.user.id is that shared account's id, not any individual
      // employee's user_accounts row, so isAccountEnabled() would be
      // checking the wrong thing entirely for it.
      const isEmployeePortalSession = (session.user?.email || '').toLowerCase() === EMPLOYEE_PORTAL_EMAIL.toLowerCase();

      if (!isEmployeePortalSession) {
        // Real administrator session — Settings → User management → User's
        // "Enable" toggle actually gates access, checked on every sign-in
        // (and token refresh), not just at signup time.
        const allowed = await isAccountEnabled(session.user.id);
        if (!allowed) {
          await signOut();
          this.view.show();
          this.view.showError('This account has been disabled by an administrator.');
          return;
        }
      }
      // Employee sessions are already gated: verify_employee_login() only
      // returns a match when that employee's own "enabled" column is true
      // (see supabase/schema.sql) — checked *before* signInToEmployeePortal()
      // is ever called, so a disabled employee never reaches this point.

      this.view.hide();

      // For an employee-portal session, the real person's name comes from
      // EmployeeSession (stashed right after verify_employee_login()
      // succeeded — see _handleSubmit below), never from session.user
      // itself, which is the same shared account for every employee.
      const employeeProfile = isEmployeePortalSession ? getEmployeeProfile() : null;
      const displayName = employeeProfile?.username
        || session.user?.user_metadata?.username
        || session.user?.email;

      const storedOperatorName = getOperatorName();
      // First sign-in with no operator name set yet: default it to the
      // account's display name rather than leaving Settings → operator
      // name blank. Still just a starting value — the person can change
      // it, same as before. See core/Operator.js's own note about this.
      if (!storedOperatorName && displayName) {
        setOperatorName(displayName);
      } else if (
        !isEmployeePortalSession &&
        session.user?.user_metadata?.username &&
        session.user?.email &&
        storedOperatorName.toLowerCase() === session.user.email.toLowerCase()
      ) {
        // One-time upgrade path: administrator accounts that signed in
        // before the username field existed got their operator name
        // auto-filled with their email (the old fallback). Now that a
        // username exists, swap it in — this only fires while the stored
        // name still exactly matches the email, so it never overwrites a
        // name someone's since typed in on purpose. Doesn't apply to
        // employee-portal sessions: their operator name never was the
        // shared portal's email in the first place.
        setOperatorName(session.user.user_metadata.username);
      }
      if (this.refs.profileUsername) this.refs.profileUsername.textContent = displayName || 'Signed in';
      if (!this._appStarted) {
        this._appStarted = true;
        this.onSignedIn(session);
      }
    } else {
      // A stale profile here would get silently attributed to whoever
      // signs in as an employee next on this browser.
      clearEmployeeProfile();
      this.view.show();
      const wasStarted = this._appStarted;
      this._appStarted = false;
      if (wasStarted) this.onSignedOut?.();
    }
  }

  async _handleSubmit(e) {
    e.preventDefault();
    this.view.clearError();
    const { username, identifier, password } = this.view.getFormData();
    const mode = this.view.mode;

    const identifierLabel = mode === 'employee' ? 'Login account' : 'Email';
    if (!identifier || !password) {
      this.view.showError(`${identifierLabel} and password are both required.`);
      return;
    }
    if (mode === 'sign-up') {
      // Username is only collected (and required) when creating a new
      // account — it becomes the display name; signing in never needs it.
      if (!username) {
        this.view.showError('Username is required.');
        return;
      }
      if (password.length < 6) {
        this.view.showError('Password must be at least 6 characters.');
        return;
      }
    }

    this.view.setLoading(true);
    try {
      if (mode === 'admin') {
        const { error } = await signInWithPassword(identifier, password);
        if (error) this.view.showError(this._friendlyError(error));
        // On success, onAuthStateChange fires _handleSessionChange for us.
      } else if (mode === 'employee') {
        const { profile, error } = await verifyEmployeeLogin(identifier, password);
        if (error) {
          this.view.showError(this._friendlyError(error));
        } else if (!profile) {
          // Deliberately generic — same reasoning as Supabase Auth's own
          // "Invalid login credentials" (see verify_employee_login()'s own
          // comment): distinguishing "wrong password" from "unknown login"
          // from "disabled account" makes it easier to enumerate valid logins.
          this.view.showError('Incorrect login account or password.');
        } else {
          // Stashed *before* signing into the shared portal account, so
          // whichever tick _handleSessionChange's listener actually fires
          // on, the real employee's profile is already there waiting.
          setEmployeeProfile(profile);
          const { error: portalError } = await signInToEmployeePortal();
          if (portalError) {
            clearEmployeeProfile();
            // Kept generic on-screen (an employee shouldn't see internal
            // config details), but logged in full so whoever's actually
            // debugging this — an admin at devtools, like right now — sees
            // the real cause immediately instead of guessing at a vague
            // "could not connect".
            console.error('[auth] signInToEmployeePortal failed:', portalError.message);
            this.view.showError('Sign-in succeeded but the app could not connect. Please try again or contact an administrator.');
          }
          // Otherwise onAuthStateChange fires _handleSessionChange for us.
        }
      } else {
        const { needsEmailConfirmation, error } = await signUp(identifier, password, username);
        if (error) {
          this.view.showError(this._friendlyError(error));
        } else if (needsEmailConfirmation) {
          this.view.showNotice('Account created — check your email to confirm it, then sign in.');
          this.view.setMode('admin');
        }
        // Otherwise (no email confirmation required by the project's
        // settings) onAuthStateChange fires _handleSessionChange for us.
      }
    } finally {
      this.view.setLoading(false);
    }
  }

  _friendlyError(error) {
    const message = error?.message || 'Something went wrong. Please try again.';
    if (/invalid login credentials/i.test(message)) return 'Incorrect email or password.';
    if (/user already registered/i.test(message)) return 'An account with that email already exists — try signing in instead.';
    return message;
  }
}
