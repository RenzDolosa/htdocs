import {
  getSession, getVerifiedUser, onAuthStateChange, signInWithPassword, signUp, signOut,
  isAccountEnabled, verifyEmployeeLogin, signInToEmployeePortal, adminAccountExists
} from '../../core/Auth.js';
import { getOperatorName, setOperatorName } from '../../core/Operator.js';
import { setEmployeeProfile, getEmployeeProfile, clearEmployeeProfile } from '../../core/EmployeeSession.js';
import { EMPLOYEE_PORTAL_EMAIL } from '../../core/supabaseConfig.js';
import { isPasswordValid, describeMissingRequirements, friendlyPasswordError } from '../../utils/passwordPolicy.js';

/**
 * AuthController is the gatekeeper in front of the rest of the app.
 * Every signed-in account — administrator or employee — has equal
 * access once it's in; there's no more admin-only gating anywhere in
 * the app (see the old core/CurrentUser.js, removed). The distinction
 * that's left is purely a sign-in *mechanism* detail, invisible to the
 * person signing in:
 *   - Employee accounts (Settings → User management → User) check a
 *     SQL-stored password (verifyEmployeeLogin — never touches Supabase
 *     Auth, so it never counts against the email rate limit), then sign
 *     the browser into one shared Supabase Auth account just so RLS
 *     sees a valid `authenticated` session. Which employee is actually
 *     signed in is tracked separately via EmployeeSession — see
 *     core/EmployeeSession.js's own doc comment.
 *   - The administrator account is a real Supabase Auth session
 *     (auth.users), created once via the sign-up flow below.
 * _handleSubmit tries the employee check first (cheap, no rate-limit
 * cost) and only falls back to a real Supabase Auth sign-in if that
 * doesn't match — so the person just enters their email/login account
 * and password once, with nothing to pick between.
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
    this._liveCheckIntervalId = null;
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
    // of the sign-up link that then disappears.
    const anAdminAlreadyExists = await adminAccountExists();
    this.view.setSignUpAvailable(!anAdminAlreadyExists);

    onAuthStateChange((session) => this._handleSessionChange(session));

    // getSession() alone would trust whatever's cached locally — a
    // session for an account deleted from the Supabase dashboard still
    // passes that check until its token happens to refresh (could be up
    // to ~1hr away). Verifying with getVerifiedUser() here means a stale
    // session gets caught at the very first page load rather than
    // silently granting access.
    const session = await getSession();
    if (session) {
      const verifiedUser = await getVerifiedUser();
      await this._handleSessionChange(verifiedUser ? session : null);
    } else {
      await this._handleSessionChange(null);
    }

    // A session can also go stale *while a tab stays open* — deleted or
    // disabled mid-session, well before its token's next scheduled
    // refresh. Two catches for that: a periodic re-check for tabs left
    // open a long time, and an immediate one when the tab regains focus
    // (the common real case — someone switches away, an admin removes
    // their access, they switch back).
    this._liveCheckIntervalId = setInterval(() => this._verifySessionStillLive(), 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this._verifySessionStillLive();
    });
  }

  /** Re-confirms an already-open session is still valid server-side; forces sign-out if not. No-op while signed out. */
  async _verifySessionStillLive() {
    if (!this._appStarted) return;
    const verifiedUser = await getVerifiedUser();
    if (!verifiedUser) {
      await signOut();
      this.view.show();
      this.view.showError('Your session is no longer valid. Please sign in again.');
    }
  }

  async _handleSessionChange(session) {
    if (session) {
      // Every employee's browser signs into the exact same shared Supabase
      // Auth account (see supabaseConfig.js's EMPLOYEE_PORTAL_EMAIL) — its
      // session.user.id is that shared account's id, not any individual
      // employee's user_accounts row, so isAccountEnabled() would be
      // checking the wrong thing entirely for it. This distinction is
      // used purely for the enabled-check and display-name logic below —
      // it no longer affects what the account can access; see this
      // file's own header comment.
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

    if (!identifier || !password) {
      this.view.showError('Email/login account and password are both required.');
      return;
    }
    if (mode === 'sign-up') {
      // Username is only collected (and required) when creating a new
      // account — it becomes the display name; signing in never needs it.
      if (!username) {
        this.view.showError('Username is required.');
        return;
      }
      if (!isPasswordValid(password)) {
        this.view.showError(describeMissingRequirements(password));
        return;
      }
    }

    this.view.setLoading(true);
    try {
      if (mode === 'sign-up') {
        const { needsEmailConfirmation, error } = await signUp(identifier, password, username);
        if (error) {
          this.view.showError(this._friendlyError(error, password));
        } else if (needsEmailConfirmation) {
          this.view.showNotice('Account created — check your email to confirm it, then sign in.');
          this.view.setMode('sign-in');
        }
        // Otherwise (no email confirmation required by the project's
        // settings) onAuthStateChange fires _handleSessionChange for us.
        return;
      }

      // Unified sign-in: try the employee check first — SQL-only, no
      // Supabase Auth call, so it never costs anything even if this
      // isn't actually an employee login. Only if that doesn't match
      // does this fall back to a real Supabase Auth sign-in. Whichever
      // one matches, matches — nothing for the person to pick.
      const { profile } = await verifyEmployeeLogin(identifier, password);
      if (profile) {
        // Stashed *before* signing into the shared portal account, so
        // whichever tick _handleSessionChange's listener actually fires
        // on, the real employee's profile is already there waiting.
        setEmployeeProfile(profile);
        const { error: portalError } = await signInToEmployeePortal();
        if (portalError) {
          clearEmployeeProfile();
          console.error(`[auth] signInToEmployeePortal failed for ${EMPLOYEE_PORTAL_EMAIL}:`, portalError.message);
          // signInToEmployeePortal() itself detects the one specific,
          // known, benign cause (supabaseConfig.js's password still
          // being the shipped placeholder — see its own comment) and
          // returns a message naming exactly that; safe to show as-is,
          // since it's a setup instruction, not anything sensitive.
          // Any *other* failure stays generic on-screen (an employee
          // shouldn't see internal config/network details) — check the
          // console line just logged for the real cause.
          this.view.showError(
            portalError.code === 'portal_password_unset'
              ? portalError.message
              : 'Sign-in succeeded but the app could not connect. Please try again or contact an administrator.'
          );
        }
        // Otherwise onAuthStateChange fires _handleSessionChange for us.
        return;
      }

      const { error: adminError } = await signInWithPassword(identifier, password);
      if (adminError) {
        // Deliberately generic — same reasoning as before: distinguishing
        // "wrong password" from "unknown login" from "not an employee,
        // try the other path" makes it easier to enumerate valid logins.
        this.view.showError('Incorrect email/login account or password.');
      }
      // Otherwise onAuthStateChange fires _handleSessionChange for us.
    } finally {
      this.view.setLoading(false);
    }
  }

  _friendlyError(error, password) {
    const message = error?.message || 'Something went wrong. Please try again.';
    if (/invalid login credentials/i.test(message)) return 'Incorrect email or password.';
    if (/user already registered/i.test(message)) return 'An account with that email already exists — try signing in instead.';
    return friendlyPasswordError(message, password);
  }
}
