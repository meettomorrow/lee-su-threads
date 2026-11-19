/**
 * UI helper for the low-follower replier (低粉高留言) tag.
 *
 * Kept separate from the pure detector in replyOnly.js: this file is allowed
 * to touch the DOM and browserAPI (i18n, storage), the detector is not.
 */

import { REPLY_PAGE_SIZE } from './replyOnly.js';

// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

/**
 * Whether the low-follower replier check/tag is enabled (default on).
 * @returns {Promise<boolean>}
 */
export async function isReplyOnlyEnabled() {
  const { replyOnlyEnabled = true } = await browserAPI.storage.local.get(['replyOnlyEnabled']);
  return replyOnlyEnabled;
}

/**
 * Build the low-follower replier tag element (bracketed localized label +
 * tooltip with the actual counts).
 * Uses only createElement/textContent/appendChild — never innerHTML.
 *
 * @param {Object} profileInfo - Profile with numeric threadCount and followerCount
 * @returns {HTMLSpanElement}
 */
export function createReplyOnlyTag(profileInfo) {
  const threads = String(profileInfo.threadCount);
  const followers = String(profileInfo.followerCount);
  const replies = String(REPLY_PAGE_SIZE);
  const label = browserAPI.i18n.getMessage('replyOnlyAccount') || 'Reply-heavy';
  const tooltip =
    browserAPI.i18n.getMessage('replyOnlyAccountTooltip', [threads, followers, replies]) ||
    `This account has only ${threads} thread(s) of its own and ${followers} follower(s), yet has replied more than ${replies} times under other people's threads.`;

  // Same bracketed plain-text family as [新帳號] / [隨機帳號]; teal marks it
  // as a behaviour signal (see the color groups in styles.css).
  const tag = document.createElement('span');
  tag.className = 'threads-reply-only-tag';
  tag.textContent = `[${label}]`;
  tag.title = tooltip;
  return tag;
}
