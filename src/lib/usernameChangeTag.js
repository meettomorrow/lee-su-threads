/**
 * UI helper for the username-change (改名) tag.
 *
 * Kept separate from the pure detector in usernameChange.js: this file is
 * allowed to touch the DOM and browserAPI (i18n), the detector is not.
 */

// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

/**
 * Build the username-change tag element: "[改名×N]" with the original Threads
 * text in the tooltip. Uses only createElement/textContent — never innerHTML.
 *
 * @param {Object} profileInfo - Profile with a parsed `formerUsernames` object
 * @returns {HTMLSpanElement}
 */
export function createUsernameChangeTag(profileInfo) {
  const { raw = '', count = null } = profileInfo.formerUsernames || {};

  const label = Number.isInteger(count)
    ? browserAPI.i18n.getMessage('usernameChangeAccount', [String(count)]) || `Renamed ×${count}`
    : browserAPI.i18n.getMessage('usernameChangeToggle') || 'Renamed';
  const tooltip =
    browserAPI.i18n.getMessage('usernameChangeTooltip', [raw]) ||
    `${raw}. Only the number of changes is shown, not the former usernames.`;

  // Same bracketed plain-text family as the other tags; violet like
  // [隨機帳號], since both describe the username (see styles.css).
  const tag = document.createElement('span');
  tag.className = 'threads-username-change-tag';
  tag.textContent = `[${label}]`;
  tag.title = tooltip;
  return tag;
}
