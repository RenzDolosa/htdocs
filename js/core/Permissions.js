/**
 * Whether the currently signed-in session can access a given
 * PERMISSION_TREE key (see models/UserGroup.js) — set once, right after
 * sign-in, by applyCurrentUserPermissions() in app.js (the earliest
 * point both userAccountStore and userGroupStore exist), read
 * synchronously by anything that needs to hide or block a section.
 *
 * Same tiny-module singleton pattern as Operator.js / EmployeeSession.js.
 *
 * No group assigned to the signed-in account (or the assigned group no
 * longer exists / was disabled) resolves to `null` here, which `can()`
 * treats as full access — same as this app's behavior before User Group
 * permissions existed at all. Restrictions are opt-in: assign someone to
 * a group to start limiting them, rather than every existing account
 * that predates this feature suddenly losing access to everything.
 */
let permissions = null;

export function setPermissions(map) {
  permissions = map;
}

/** @returns {boolean} */
export function can(key) {
  if (!permissions) return true;
  return permissions[key] !== false;
}
