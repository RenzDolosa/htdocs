/**
 * Whether the currently signed-in session is an Administrator or an
 * Employee — used to be read synchronously by feature controllers to
 * gate admin-only behavior. That gating is gone now (see
 * AuthController.js's own header comment: every signed-in account has
 * equal access, and Settings → User management → User group's
 * permission tree is the one access-control layer left) — nothing
 * calls setIsAdministrator() anymore, so isAdministrator() is dead code
 * left over from that architecture. Not removed here since that's a
 * separate cleanup from what this module is being extended for below;
 * flagging it rather than silently deleting it.
 */
let administrator = true;

export function setIsAdministrator(value) {
  administrator = value;
}

export function isAdministrator() {
  return administrator;
}

/**
 * The signed-in session's own UserAccount.username. Set by app.js's
 * applyCurrentUserPermissions(), from the exact same account lookup that
 * already resolves the session's permissions and warehouse scope
 * (employee: EmployeeSession's stashed profile; administrator: the
 * user_accounts row matching this browser's authUserId).
 *
 * This existed for one thing: matching a signed-in person against
 * WarehouseLocation.assignedUsername / Gadget.pendingTransfer.assignedTo
 * to decide whether *they specifically* could confirm a given pending
 * transfer. That per-location assignment mechanism is gone now (see
 * models/WarehouseLocation.js's own history, and merchantPlacement.js's
 * destinationWarehouseId) — confirming a pending transfer is decided by
 * core/WarehouseScope.js's isWarehouseAllowed() instead, which needs a
 * warehouse id, not a username. Nothing reads getCurrentUsername()
 * anymore, so — same as isAdministrator() above — this is dead code left
 * over from the architecture it was built for; flagging it rather than
 * silently deleting it, same reasoning as that comment.
 */
let currentUsername = '';

export function setCurrentUsername(username) {
  currentUsername = (username || '').trim();
}

export function getCurrentUsername() {
  return currentUsername;
}
