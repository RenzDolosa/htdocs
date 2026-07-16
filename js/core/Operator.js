/**
 * This app has no login system, so history entries and manifests have no
 * built-in answer to "who did this". Operator is a deliberately small
 * stand-in: a self-reported name the person using this browser sets once
 * (Settings tab), persisted in localStorage, and read by anything that
 * wants to stamp an action or prefill a "Prepared by" field.
 *
 * It's per-browser, not per-account — that's a real limitation, not an
 * oversight. If this app grows real authentication later, everything
 * that currently calls getOperatorName() is exactly what should switch
 * over to reading the authenticated user instead.
 */

const STORAGE_KEY = 'stockroom_operator_name';

export function getOperatorName() {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch (e) {
    return '';
  }
}

export function setOperatorName(name) {
  try {
    localStorage.setItem(STORAGE_KEY, (name || '').trim());
  } catch (e) {
    // localStorage can throw in private-browsing/quota-exceeded edge cases;
    // losing the operator name isn't worth surfacing an error for.
  }
}
