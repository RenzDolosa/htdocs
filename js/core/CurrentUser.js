/**
 * Whether the currently signed-in session is an Administrator or an
 * Employee — set once by AuthController right after it works out which
 * kind of session this is (see AuthController._handleSessionChange's own
 * isEmployeePortalSession check), read synchronously by any feature that
 * needs to gate something to administrators only.
 *
 * Same tiny-module state pattern as Operator.js / EmployeeSession.js —
 * deliberately not folded into either of those: Operator is a
 * self-reported display name, not an identity check, and EmployeeSession
 * only ever holds data for employee sessions specifically. This one is
 * the single yes/no every feature controller actually needs.
 *
 * Defaults to true (administrator) simply so nothing before the first
 * real session check accidentally renders as locked-down — in practice
 * nothing reads this before AuthController has already set it, since
 * feature controllers are only ever constructed after a successful
 * sign-in (see app.js's onSignedIn).
 */
let administrator = true;

export function setIsAdministrator(value) {
  administrator = value;
}

export function isAdministrator() {
  return administrator;
}
