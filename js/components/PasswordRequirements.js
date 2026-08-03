import { checkPassword } from '../utils/passwordPolicy.js';

/**
 * Mounts a live ✓ checklist under (or beside, via `target`) a password
 * input, one line per utils/passwordPolicy.js rule, updating as the
 * person types. Replaces finding out about the password policy only
 * after a submit attempt bounces off a raw server error (see that
 * module's own doc comment for why the rules live there and not here).
 *
 * Deliberately unalarming while empty or mid-typing: unmet rules sit in
 * neutral grey with a plain dot, not red with an X — this is guidance for
 * a password that isn't finished yet, not a validation error. Red/error
 * styling is reserved for an actual failed submit elsewhere in each
 * form, same convention as every other field's .field-error.
 *
 * Only used on Settings → General → Change password — deliberately *not*
 * on the sign-in/sign-up screen, even for the sign-up password: that
 * field briefly showed it too, and it read as an oddly-placed checklist
 * sitting next to the Password box every time someone just signed in.
 * Sign-up still validates the same policy and shows a plain, friendly
 * error line if it's not met (see AuthController's use of
 * describeMissingRequirements) — it just doesn't get the live checklist.
 *
 * @param {HTMLInputElement} input - the password field to attach to.
 * @param {{ target?: HTMLElement }} [options] - `target`: mount the
 *   checklist inside this element instead of next to the input — for a
 *   side-by-side layout (Change password puts it beside New password +
 *   Confirm password rather than stacked under either one). When
 *   omitted, the checklist is inserted right after whichever element
 *   actually determines the field's width — the input's `.password-field`
 *   reveal-toggle wrapper if it has one, otherwise the input itself.
 *   Inserting after the bare input would land the checklist *inside*
 *   that wrapper, as a flex sibling squeezed between the input and the
 *   eye icon rather than a block sitting below the field.
 * @returns {{ update: () => void, destroy: () => void }}
 */
export function mountPasswordRequirements(input, { target } = {}) {
  const list = document.createElement('ul');
  list.className = 'password-requirements';
  if (target) {
    target.appendChild(list);
  } else {
    (input.closest('.password-field') || input).insertAdjacentElement('afterend', list);
  }

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
