/**
 * UI helper for the disposable-handle (免洗帳號) tag.
 *
 * Kept separate from the pure detector in disposableHandle.js: this file is
 * allowed to touch the DOM and browserAPI (i18n), the detector is not.
 */

// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

/**
 * Build the disposable-handle tag element (emoji + localized label + tooltip).
 * Uses only createElement/textContent/appendChild — never innerHTML.
 *
 * @returns {HTMLSpanElement}
 */
export function createDisposableTag() {
  const label = browserAPI.i18n.getMessage('disposableAccount') || 'Default handle';
  const tooltip =
    browserAPI.i18n.getMessage('disposableAccountTooltip') ||
    'This account still uses the username Threads assigned by default and has never changed it. This does not mean it is a fake account.';

  const tag = document.createElement('span');
  tag.className = 'threads-disposable-tag';
  tag.textContent = `🧻 ${label}`;
  tag.title = tooltip;
  return tag;
}
