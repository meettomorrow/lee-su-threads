/**
 * Fill in what cached profiles are missing, for post badges on screen.
 *
 * A post badge can be built straight from cache, which costs no requests. Two
 * kinds of data may still be missing from that cached profile:
 *
 *   refresh  - it was parsed by an older parser (see lib/profileSchema.js),
 *              e.g. before former usernames were read. Cached profiles live up
 *              to 21 days, so without this, new fields would stay missing on
 *              familiar accounts for weeks. One profile request (plus the
 *              replier check when the user was seen replying).
 *   replier  - the low-follower replier verdict isn't settled yet (see
 *              lib/replyOnly.js). Up to 3 requests, and only for users seen
 *              replying; for anyone else the injected script answers at once
 *              without a request.
 *
 * Both go through one queue with the same rules as the main auto-fetch: the
 * badge must be on screen for a moment, one user at a time, a pause after each
 * user that cost requests, behind the main auto-fetch queue, and only while
 * auto-query is on, not rate limited and logged in. Each user is handled at
 * most once per page.
 *
 * Followers/following lists are left alone: they only fetch on a manual click.
 */

import { isProfileOutdated } from './profileSchema.js';
import { isReplierCheckSettled } from './replyOnly.js';
import { getUserIdByUsername, fetchProfileByUserId, checkCachedReplier } from './profileFetcher.js';

// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const MAX_QUEUE_SIZE = 10; // Same cap as the main auto-fetch queue
const VISIBILITY_DELAY_MS = 500; // How long a badge must be visible before queuing

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * What, if anything, to fetch for a cached profile. Pure; safe to unit-test.
 *
 * @param {Object} profileInfo - Cached profile
 * @param {Object} enabled
 * @param {boolean} enabled.refresh - Re-fetch outdated profiles
 * @param {boolean} enabled.replier - Run the low-follower replier check
 * @returns {'refresh'|'replier'|null}
 */
export function planProfileUpdate(profileInfo, { refresh, replier }) {
  if (!profileInfo || typeof profileInfo !== 'object' || profileInfo._userIdOnly) return null;
  if (refresh && isProfileOutdated(profileInfo)) return 'refresh';
  if (replier && !isReplierCheckSettled(profileInfo)) return 'replier';
  return null;
}

/**
 * @param {Object} options
 * @param {Object} options.state - Shared content-script state (autoQueryEnabled, rateLimitedUntil, isUserLoggedIn, isFetching)
 * @param {Map} options.profileCache - In-memory profile cache
 * @param {number} options.delayMs - Pause after each user that cost requests
 * @param {() => Promise<{refresh: boolean, replier: boolean}>} options.getEnabled -
 *   Which kinds of update are switched on, checked before each user
 * @param {(profileInfo: Object, badge: HTMLElement) => void} [options.onUpdated] -
 *   Update an on-screen badge with the filled-in profile
 * @returns {{ observe: (badge: HTMLElement, profileInfo: Object) => void, resume: () => void }}
 */
export function createProfileRefresh({ state, profileCache, delayMs, getEnabled, onUpdated = () => {} }) {
  const queue = []; // [{ username, badge }], most recently visible first
  const attempted = new Set(); // usernames already handled (or tried) on this page
  const visibilityTimers = new Map(); // badge -> timeout id
  let lastRequestAt = 0; // when the last user that cost requests finished
  let running = false;
  let resumeTimer = null; // scheduled run() for when a rate-limit cooldown ends

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const badge = entry.target;
      if (entry.isIntersecting) {
        if (visibilityTimers.has(badge)) continue;
        visibilityTimers.set(badge, setTimeout(() => {
          visibilityTimers.delete(badge);
          observer.unobserve(badge);
          enqueue(badge.dataset.refreshUsername, badge);
        }, VISIBILITY_DELAY_MS));
      } else {
        clearTimeout(visibilityTimers.get(badge));
        visibilityTimers.delete(badge);
      }
    }
  });

  function canFetch() {
    return state.autoQueryEnabled &&
      Date.now() >= state.rateLimitedUntil &&
      state.isUserLoggedIn !== false;
  }

  function enqueue(username, badge) {
    if (!username || attempted.has(username)) return;

    const existing = queue.findIndex((item) => item.username === username);
    if (existing !== -1) queue.splice(existing, 1);
    queue.unshift({ username, badge });

    // Drop the oldest; watch them again so they re-queue if scrolled back to
    while (queue.length > MAX_QUEUE_SIZE) {
      const dropped = queue.pop();
      if (dropped.badge.isConnected) observer.observe(dropped.badge);
    }

    run();
  }

  async function run() {
    if (running) return;
    running = true;
    try {
      while (queue.length > 0 && canFetch()) {
        // Let the main auto-fetch queue go first
        if (state.isFetching) {
          await sleep(delayMs);
          continue;
        }

        // Pace by time since the last request, not by queue length, so a user
        // who scrolls into view right after one finished still waits
        const wait = lastRequestAt + delayMs - Date.now();
        if (wait > 0) {
          await sleep(wait);
          continue; // re-check the gates after waiting
        }

        const { username, badge } = queue.shift();
        if (attempted.has(username)) continue;
        const cached = profileCache.get(username);
        const enabled = await getEnabled();
        const plan = planProfileUpdate(cached, enabled);
        if (!plan) continue;

        attempted.add(username);
        if (await update(plan, username, badge, cached, enabled)) {
          lastRequestAt = Date.now();
        }
      }
    } finally {
      running = false;
    }
    scheduleResume();
  }

  // Queued badges are no longer observed, so nothing would restart the queue
  // after a cooldown. Re-observing them would just loop (a visible badge fires
  // at once and hits the gate again), so wake up once when the cooldown ends.
  // Auto-query being switched back on is handled by resume().
  function scheduleResume() {
    const waitMs = state.rateLimitedUntil - Date.now();
    if (queue.length === 0 || waitMs <= 0 || resumeTimer) return;
    resumeTimer = setTimeout(() => {
      resumeTimer = null;
      run();
    }, waitMs);
  }

  /**
   * @returns {Promise<boolean>} whether any request was sent
   */
  async function update(plan, username, badge, cached, enabled) {
    let result;
    if (plan === 'refresh') {
      const userId = await getUserIdByUsername(username);
      if (!userId) return false;
      result = await fetchProfileByUserId(userId, { checkReplyOnly: enabled.replier });
      if (!result || result._rateLimited || result._loginRequired) return true;
    } else {
      // null: not seen replying, answered without a request
      const signals = await checkCachedReplier(username);
      if (signals === null) return false;
      if (Object.keys(signals).length === 0) return true;
      result = signals;
    }

    // Merge onto the latest entry, not the one read before the requests
    const latest = profileCache.get(username) ?? cached;
    const updated = { ...latest, ...result };
    // A refresh re-read the location too, so the entry gets a new timestamp;
    // replier signals alone keep the old one (background.js keeps it if set)
    if (plan === 'refresh') delete updated.timestamp;

    profileCache.set(username, updated);
    browserAPI.runtime.sendMessage({ type: 'PROFILE_INFO_EXTRACTED', data: updated });

    if (badge.isConnected) onUpdated(updated, badge);
    return true;
  }

  return {
    /**
     * Restart a queue stopped by the gates, e.g. when auto-query is switched
     * back on or the user logs back in. Safe to call any time: while still
     * gated it at most (re)arms the cooldown timer.
     */
    resume() {
      run();
    },

    /**
     * Watch a post badge built from cache; fill in its profile once visible.
     * Cheap check only; the toggles are read when the user's turn comes.
     * @param {HTMLElement} badge
     * @param {Object} profileInfo
     */
    observe(badge, profileInfo) {
      if (attempted.has(profileInfo.username)) return;
      if (!planProfileUpdate(profileInfo, { refresh: true, replier: true })) return;
      badge.dataset.refreshUsername = profileInfo.username;
      observer.observe(badge);
    },
  };
}
