import { generateId } from '../utils/id.js';

/**
 * UserAccount is a login account shown under Settings → User management →
 * User (the reference app's user list — user number, username, login
 * account, group, contact info, enabled state, timestamps). It's
 * separate from the operator name in Settings → General: that's a single
 * "who am I" label with no login concept, while these are the actual
 * accounts that would sign into the system.
 */
export class UserAccount {
  constructor(data = {}) {
    this.id = data.id || generateId('usr');
    // Cosmetic display id, like "16455669" in the reference UI — not used as a lookup key.
    this.userNumber = data.userNumber || String(10000000 + Math.floor(Math.random() * 89999999));
    this.username = data.username || '';
    this.loginAccount = data.loginAccount || '';
    this.userGroup = data.userGroup || '';
    this.mail = data.mail || '';
    this.phoneNumber = data.phoneNumber || '';
    this.enabled = data.enabled !== false;
    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = data.updatedAt || Date.now();
    this.lastLoginAt = data.lastLoginAt || null;
    // Set only by the auth.users → user_accounts trigger (see
    // supabase/schema.sql), never by the client — a non-null value means
    // this row is a real Supabase Auth account someone can sign in as;
    // null means it's a directory-only entry added by hand via "+ Add user".
    this.authUserId = data.authUserId || null;
    this.history = data.history || [];
  }

  static validate(data, { existing = [], editingId = null } = {}) {
    const errors = {};
    if (!data.username || !data.username.trim()) errors.username = 'Username is required.';
    if (!data.loginAccount || !data.loginAccount.trim()) {
      errors.loginAccount = 'Login account is required.';
    } else {
      const dupe = existing.some((u) => u.id !== editingId && u.loginAccount.trim().toLowerCase() === data.loginAccount.trim().toLowerCase());
      if (dupe) errors.loginAccount = 'This login account is already in use.';
    }
    return { valid: Object.keys(errors).length === 0, errors };
  }

  /** Mirrors Gadget.addLogEntry — same shape, so it drops straight into the shared LogModal. */
  addLogEntry(message, type = 'update', meta = null, performedBy = '') {
    const entry = { id: generateId('log'), type, message, timestamp: Date.now() };
    if (meta) entry.meta = meta;
    if (performedBy) entry.performedBy = performedBy;
    this.history.push(entry);
  }
}
