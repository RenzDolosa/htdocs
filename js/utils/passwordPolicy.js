/**
 * Single source of truth for "what makes a good new password" across the
 * app — Settings → General → Change password, the sign-up screen, and
 * Settings → User management → User's employee password field all point
 * at this, so they describe the same rules the same way instead of each
 * only finding out via a raw server error after the person hits submit.
 *
 * The four character-class rules mirror this project's Supabase
 * Authentication → Policies → Password Requirements setting exactly (see
 * that dashboard for the authoritative configuration — this file is a
 * client-side *mirror* of it for UX purposes, not the source of truth).
 * If that policy is ever changed there, update PASSWORD_RULES to match,
 * or Change password / sign-up will show a checklist that looks
 * satisfied while GoTrue still rejects the submission server-side.
 *
 * The employee password field (UserAccountForm.js) never reaches
 * Supabase Auth at all — it's a separate, SQL-stored credential (see
 * setEmployeePassword in core/Auth.js) with no server-enforced policy of
 * its own. It still shows this same checklist for visual consistency and
 * to encourage strong passwords, but doesn't hard-block on it the way
 * Change password / sign-up do, since blocking there would be this file
 * inventing a new requirement rather than surfacing a real one.
 */
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 6 characters', test: (pw) => pw.length >= 6 },
  { id: 'lower', label: 'A lowercase letter (a-z)', test: (pw) => /[a-z]/.test(pw) },
  { id: 'upper', label: 'An uppercase letter (A-Z)', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'digit', label: 'A number (0-9)', test: (pw) => /[0-9]/.test(pw) },
  { id: 'special', label: 'A special character (e.g. !@#$%)', test: (pw) => /[^A-Za-z0-9]/.test(pw) }
];

/** @returns {Array<{id:string,label:string,passed:boolean}>} every rule, each marked passed/failed against `password`. */
export function checkPassword(password) {
  const value = password || '';
  return PASSWORD_RULES.map((rule) => ({ id: rule.id, label: rule.label, passed: rule.test(value) }));
}

/** @returns {boolean} true only when every rule passes. */
export function isPasswordValid(password) {
  return checkPassword(password).every((r) => r.passed);
}

/** @returns {string} a short, readable sentence naming what's still missing, or '' if the password already satisfies every rule. */
export function describeMissingRequirements(password) {
  const missing = checkPassword(password).filter((r) => !r.passed);
  if (missing.length === 0) return '';
  const items = missing.map((r) => r.label.replace(/^(A|An) /, '').toLowerCase());
  return `Password needs ${items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`}.`;
}

/**
 * Rewrites GoTrue's own password-policy error — a single run-on sentence
 * listing every allowed character in every class, e.g. "Password should
 * contain at least one character of each: abcdefghijk..., ABCDEFG...,
 * 0123456789, !@#$%^&*()..." — into the same short, specific phrasing as
 * describeMissingRequirements(), using the actual password that was
 * submitted to say exactly what it's still missing rather than repeating
 * the entire allowed alphabet back at the person. Falls through
 * unchanged for any other error (wrong current password, rate limits,
 * etc.) — this only rewrites the one message pattern it recognizes.
 */
export function friendlyPasswordError(message, password) {
  if (!message) return message;
  if (/character of each/i.test(message)) {
    return describeMissingRequirements(password) || 'Password does not meet the requirements below.';
  }
  return message;
}
