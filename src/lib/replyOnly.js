/**
 * Low-follower replier detection (低粉高留言判定)
 *
 * Flags accounts that barely post or are followed, yet reply all over other
 * people's threads. Threads exposes no post/reply counts, so each signal comes
 * from one of Threads' own profile queries, asked for just enough items to
 * answer a threshold question:
 *
 *   1. Threads tab   (BarcelonaProfileThreadsTabDirectQuery)  → at most MAX_THREADS threads
 *   2. Profile page  (BarcelonaProfilePageDirectQuery)        → fewer than LOW_FOLLOWER_THRESHOLD
 *                                                                followers, and not blocked by the viewer
 *   3. Replies tab   (BarcelonaProfileRepliesTabDirectQuery)  → more than one page of replies
 *
 * Checks run in that order and stop at the first failing one, and only for
 * accounts we have seen replying, so most people cost no extra requests.
 * Any unknown signal (private account, failed request) means no tag.
 *
 * Pure, side-effect free: no DOM, no browserAPI, no network. Safe to unit-test.
 */

// At most this many threads of their own.
export const MAX_THREADS = 5;
// Fewer followers than this.
export const LOW_FOLLOWER_THRESHOLD = 10;
// Replies tab page size; "more than one page" means has_next_page on this page.
export const REPLY_PAGE_SIZE = 10;

/**
 * Number of threads in a Threads tab response requested with
 * `first: MAX_THREADS + 1`, so MAX_THREADS + 1 means "more than MAX_THREADS".
 *
 * Private accounts the viewer does not follow come back as an error with no
 * data ("Forbidden"), which we treat as unknown rather than "no threads".
 *
 * @param {Object} json - Parsed GraphQL response body.
 * @returns {number|null} null when the answer is unknown.
 */
export function parseThreadCount(json) {
  const edges = json?.data?.mediaData?.edges;
  return Array.isArray(edges) ? edges.length : null;
}

/**
 * Read follower count and block state from a profile page response.
 *
 * @param {Object} json - Parsed GraphQL response body.
 * @returns {{ followerCount: number, blocking: boolean }|null} null when unknown.
 */
export function parseProfilePage(json) {
  const user = json?.data?.user;
  const followerCount = user?.follower_count;
  if (!Number.isInteger(followerCount) || followerCount < 0) {
    return null;
  }
  return { followerCount, blocking: user.friendship_status?.blocking === true };
}

/**
 * Whether a Replies tab response (requested with `first: REPLY_PAGE_SIZE`)
 * has another page after this one.
 *
 * @param {Object} json - Parsed GraphQL response body.
 * @returns {boolean|null} null when unknown.
 */
export function parseHasManyReplies(json) {
  const mediaData = json?.data?.mediaData;
  if (!Array.isArray(mediaData?.edges)) {
    return null;
  }
  return mediaData.page_info?.has_next_page === true;
}

/**
 * Whether a (cached) profile should carry the 低粉高留言 tag. Every signal
 * must be known; a missing one (older cache entry, failed request) means no.
 *
 * @param {Object} profileInfo
 * @returns {boolean}
 */
export function isLowFollowerReplier(profileInfo) {
  return (
    Number.isInteger(profileInfo?.threadCount) &&
    profileInfo.threadCount <= MAX_THREADS &&
    Number.isInteger(profileInfo.followerCount) &&
    profileInfo.followerCount < LOW_FOLLOWER_THRESHOLD &&
    profileInfo.blocking === false &&
    profileInfo.hasManyReplies === true
  );
}

/**
 * Whether the gates in the header reached a verdict for this profile (tag or
 * no tag). A cached profile that never ran them (cached before the check
 * existed, or cached where the user wasn't seen replying) or stopped on a
 * failed request is not settled and worth checking again.
 *
 * @param {Object} profileInfo
 * @returns {boolean}
 */
export function isReplierCheckSettled(profileInfo) {
  if (!Number.isInteger(profileInfo?.threadCount)) return false;
  if (profileInfo.threadCount > MAX_THREADS) return true;
  if (!Number.isInteger(profileInfo.followerCount) || typeof profileInfo.blocking !== 'boolean') return false;
  if (profileInfo.blocking || profileInfo.followerCount >= LOW_FOLLOWER_THRESHOLD) return true;
  return typeof profileInfo.hasManyReplies === 'boolean';
}

/**
 * If `obj` is a post object that is a reply, return its author's user ID.
 *
 * @param {Object} obj - Any object from an intercepted Threads response.
 * @returns {string|null}
 */
export function getReplyAuthorId(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.text_post_app_info?.is_reply !== true) return null;
  const authorId = String(obj.user?.pk || obj.user?.id || '');
  return /^\d+$/.test(authorId) ? authorId : null;
}

/**
 * Walk an intercepted response and collect the author IDs of every reply in
 * it. Only these accounts are worth checking.
 *
 * @param {*} root - Parsed JSON from any Threads response.
 * @returns {Set<string>}
 */
export function collectReplyAuthorIds(root) {
  const authorIds = new Set();
  const stack = [root];
  while (stack.length > 0) {
    const obj = stack.pop();
    if (!obj || typeof obj !== 'object') continue;
    const authorId = getReplyAuthorId(obj);
    if (authorId) authorIds.add(authorId);
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return authorIds;
}
