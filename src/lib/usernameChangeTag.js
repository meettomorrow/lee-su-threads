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

/**
 * Add the username-change tag to an already-rendered badge, right after
 * [新帳號] (or first among the tags when there is no new-user tag).
 *
 * @param {HTMLElement} badge
 * @param {HTMLSpanElement} tag
 */
export function insertUsernameChangeTag(badge, tag) {
  const newUserTag = badge.querySelector('.threads-new-user-tag');
  if (newUserTag) {
    newUserTag.after(tag);
    return;
  }
  const firstOtherTag = badge.querySelector('.threads-disposable-tag, .threads-reply-only-tag');
  if (firstOtherTag) {
    firstOtherTag.before(tag);
  } else {
    badge.appendChild(tag);
  }
}
