/**
 * Refresh cached profiles parsed by an older parser (see lib/profileSchema.js).
 *
 * Cached profiles are kept for up to 21 days, so without this, data added in a
 * new version (e.g. the [改名] tag) would stay missing on familiar accounts for
 * weeks. Instead of clearing the cache, a post badge built from an outdated
 * profile is watched, and once it has been on screen for a moment the profile
 * is fetched again — one at a time, behind the main auto-fetch queue, and under
 * the same rules (auto-query on, not rate limited, logged in). Each account is
 * tried at most once per page.
 *
 * Followers/following lists are left alone: they only fetch on a manual click.
 */

import { isProfileOutdated } from './profileSchema.js';
import { getUserIdByUsername, fetchProfileByUserId } from './profileFetcher.js';

// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const MAX_QUEUE_SIZE = 10; // Same cap as the main auto-fetch queue
const VISIBILITY_DELAY_MS = 500; // How long a badge must be visible before queuing

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {Object} options
 * @param {Object} options.state - Shared content-script state (autoQueryEnabled, rateLimitedUntil, isUserLoggedIn, isFetching)
 * @param {Map} options.profileCache - In-memory profile cache
 * @param {number} options.delayMs - Pause between refresh fetches
 * @param {() => Promise<boolean>} [options.shouldRefresh] - Checked before each fetch;
 *   false skips it (e.g. when nothing the newer version adds is turned on)
 * @param {(profileInfo: Object, badge: HTMLElement) => void} [options.onRefreshed] -
 *   Update an on-screen badge with the refreshed profile
 * @returns {{ observe: (badge: HTMLElement, profileInfo: Object) => void }}
 */
export function createProfileRefresh({ state, profileCache, delayMs, shouldRefresh = async () => true, onRefreshed = () => {} }) {
  const queue = []; // [{ username, badge }], most recently visible first
  const attempted = new Set(); // usernames already refreshed (or tried) on this page
  const visibilityTimers = new Map(); // badge -> timeout id
  let running = false;

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

        const { username, badge } = queue.shift();
        const cached = profileCache.get(username);
        if (attempted.has(username) || !isProfileOutdated(cached)) continue;

        attempted.add(username);
        if (!(await shouldRefresh())) continue;
        await refresh(username, badge, cached);

        if (queue.length > 0) await sleep(delayMs);
      }
    } finally {
      running = false;
    }
  }

  async function refresh(username, badge, cached) {
    const userId = await getUserIdByUsername(username);
    if (!userId) return;

    const result = await fetchProfileByUserId(userId);
    if (!result || result._rateLimited || result._loginRequired) return;

    // Keep what the old entry had that a plain profile fetch doesn't return
    // (low-follower replier signals). The fetch refreshed the location too,
    // so the entry gets a new timestamp.
    const updated = { ...cached, ...result };
    delete updated.timestamp;

    profileCache.set(username, updated);
    browserAPI.runtime.sendMessage({ type: 'PROFILE_INFO_EXTRACTED', data: updated });

    if (badge.isConnected) onRefreshed(updated, badge);
  }

  return {
    /**
     * Watch a post badge built from cache; refresh once it has been visible.
     * @param {HTMLElement} badge
     * @param {Object} profileInfo
     */
    observe(badge, profileInfo) {
      if (!isProfileOutdated(profileInfo) || attempted.has(profileInfo.username)) return;
      badge.dataset.refreshUsername = profileInfo.username;
      observer.observe(badge);
    },
  };
}
