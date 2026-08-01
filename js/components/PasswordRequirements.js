import { checkPassword } from '../utils/passwordPolicy.js';

/**
 * Mounts a live ✓ checklist directly under a password input, one line per
 * utils/passwordPolicy.js rule, updating as the person types. Replaces
 * finding out about the password policy only after a submit attempt
 * bounces off a raw server error (see that module's own doc comment for
 * why the rules live there and not here).
 *
 * Deliberately unalarming while empty or mid-typing: unmet rules sit in
 * neutral grey with a plain dot, not red with an X — this is guidance for
 * a password that isn't finished yet, not a validation error. Red/error
 * styling is reserved for an actual failed submit elsewhere in each
 * form, same convention as every other field's .field-error.
 *
 * @param {HTMLInputElement} input - the password field to attach under.
 * @returns {{ update: () => void, destroy: () => void }}
 */
export function mountPasswordRequirements(input) {
  const list = document.createElement('ul');
  list.className = 'password-requirements';
  input.insertAdjacentElement('afterend', list);

  function update() {
    const value = input.value;
    const rules = checkPassword(value);
    list.innerHTML = rules.map((r) => `
      <li class="${r.passed ? 'met' : ''}">
        <span class="password-req-icon" aria-hidden="true">${r.passed ? '✓' : '·'}</span>
        ${r.label}
      </li>
    `).join('');
  }

  function destroy() {
    input.removeEventListener('input', update);
    list.remove();
  }

  input.addEventListener('input', update);
  update();
  return { update, destroy, list };
}
