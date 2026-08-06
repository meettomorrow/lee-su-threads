/**
 * UI helper for the disposable-handle (隨機帳號) tag.
 *
 * Kept separate from the pure detector in disposableHandle.js: this file is
 * allowed to touch the DOM and browserAPI (i18n), the detector is not.
 */

// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

/**
 * Build the disposable-handle tag element (bracketed localized label + tooltip).
 * Uses only createElement/textContent/appendChild — never innerHTML.
 *
 * @returns {HTMLSpanElement}
 */
export function createDisposableTag() {
  const label = browserAPI.i18n.getMessage('disposableAccount') || 'Random handle';
  const tooltip =
    browserAPI.i18n.getMessage('disposableAccountTooltip') ||
    'This account still uses the random username Threads assigned by default and has never changed it. This does not mean it is a fake account.';

  // Plain bracketed text (no emoji) to match the [新帳號] / [NEW] marker family;
  // purple keeps it distinct from the red new-user tag.
  const tag = document.createElement('span');
  tag.className = 'threads-disposable-tag';
  tag.textContent = `[${label}]`;
  tag.title = tooltip;
  return tag;
}
