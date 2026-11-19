/**
 * Which tags a profile carries, in display order.
 *
 * One place for the rules the badges in posts and lists also follow, so the
 * popup's tag views agree with what users see on Threads:
 *   newUser        [新帳號]     joined recently, unless verified
 *   usernameChange [改名]       former usernames listed     (toggle: usernameChangeEnabled)
 *   disposable     [隨機帳號]   system-default handle       (toggle: disposableAccountEnabled)
 *   replyHeavy     [低粉高留言] low-follower replier        (toggle: replyOnlyEnabled)
 *
 * Pure, side-effect free: no DOM, no browserAPI. Safe to unit-test directly.
 */

import { isNewUser } from './dateParser.js';
import { hasUsernameChange } from './usernameChange.js';
import { isDisposableHandle } from './disposableHandle.js';
import { isLowFollowerReplier } from './replyOnly.js';

export const TAG_ORDER = ['newUser', 'usernameChange', 'disposable', 'replyHeavy'];

/**
 * @param {Object} profileInfo
 * @param {Object} [settings] - Tag toggles from storage; missing means on
 * @param {boolean} [settings.usernameChangeEnabled]
 * @param {boolean} [settings.disposableAccountEnabled]
 * @param {boolean} [settings.replyOnlyEnabled]
 * @param {Date} [referenceDate] - "Now" for the new-user check (tests)
 * @returns {string[]} Tag keys from TAG_ORDER
 */
export function getProfileTags(profileInfo, settings = {}, referenceDate = new Date()) {
  if (!profileInfo || typeof profileInfo !== 'object') return [];
  const {
    usernameChangeEnabled = true,
    disposableAccountEnabled = true,
    replyOnlyEnabled = true,
  } = settings;

  const tags = [];
  if (!profileInfo.isVerified && isNewUser(profileInfo.joined, 2, referenceDate)) {
    tags.push('newUser');
  }
  if (usernameChangeEnabled && hasUsernameChange(profileInfo)) {
    tags.push('usernameChange');
  }
  if (disposableAccountEnabled && isDisposableHandle(profileInfo.username).isDisposable) {
    tags.push('disposable');
  }
  if (replyOnlyEnabled && isLowFollowerReplier(profileInfo)) {
    tags.push('replyHeavy');
  }
  return tags;
}
