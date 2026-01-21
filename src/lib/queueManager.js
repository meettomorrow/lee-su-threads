/**
 * Queue management for auto-fetching profiles
 * Handles both feed and follower queues with throttling and rate limiting
 */

import { displayProfileInfo, autoFetchProfile } from './postUI.js';
import { createLocationBadge } from './friendshipsUI.js';
import { fetchProfileByUserId, updateButtonWithFetchResult } from './profileFetcher.js';

/**
 * Shared queue function for both feed and followers
 * @param {string} username - Username to queue
 * @param {HTMLElement} btn - Button element
 * @param {Array} queue - Queue array to add to
 * @param {IntersectionObserver} observer - Observer to re-observe removed items
 * @param {Function} processFunc - Function to call to process the queue
 * @param {boolean} shouldProcess - Whether to start processing immediately
 * @param {Map} profileCache - Profile cache
 * @param {number} maxQueueSize - Maximum queue size
 */
export function queueFetch(username, btn, queue, observer, processFunc, shouldProcess, profileCache, maxQueueSize) {
  // Don't queue if already cached
  if (profileCache.has(username)) return;

  // Check if already in queue
  const existingIndex = queue.findIndex(item => item.username === username);
  if (existingIndex !== -1) {
    // Already in queue - move to front (prioritize recently visible)
    const existing = queue.splice(existingIndex, 1)[0];
    queue.unshift(existing);
    return;
  }

  // Add to front of queue (newest visible items get priority)
  queue.unshift({ username, btn });

  // Trim queue if it exceeds max size (remove oldest items from the back)
  while (queue.length > maxQueueSize) {
    const removed = queue.pop();
    // Re-observe removed items so they can be re-queued if scrolled back
    if (removed && removed.btn && observer) {
      observer.observe(removed.btn);
    }
  }

  // Start processing if conditions are met
  if (shouldProcess) {
    processFunc();
  }
}

/**
 * Process the feed fetch queue with throttling
 * @param {Array} fetchQueue - Feed queue array
 * @param {Object} state - State object containing flags and settings
 * @param {Map} profileCache - Profile cache
 * @param {number} fetchDelayMs - Delay between fetches
 */
export async function processFetchQueue(fetchQueue, state, profileCache, fetchDelayMs) {
  if (state.isFetching || fetchQueue.length === 0) return;

  // Check if auto-query is disabled
  if (!state.autoQueryEnabled) {
    console.log('[Threads Extractor] Auto-query disabled. Skipping queue processing.');
    return;
  }

  // Check if rate limited
  if (Date.now() < state.rateLimitedUntil) {
    console.log('[Threads Extractor] Rate limit cooldown active. Skipping queue processing.');
    return;
  }

  state.isFetching = true;

  while (fetchQueue.length > 0) {
    // Stop processing if user is logged out
    if (state.isUserLoggedIn === false) {
      console.log('[Threads Extractor] User logged out. Stopping queue processing.');
      fetchQueue.length = 0; // Clear the queue
      break;
    }

    // Check rate limit before each fetch
    if (Date.now() < state.rateLimitedUntil) {
      console.log('[Threads Extractor] Rate limit triggered. Stopping queue processing.');
      break;
    }

    const { username, btn } = fetchQueue.shift();
    console.log(`[Threads Extractor] Processing @${username}, queue length: ${fetchQueue.length}`);

    // Skip if already fetched while in queue
    if (profileCache.has(username)) {
      const cached = profileCache.get(username);
      displayProfileInfo(cached);
      btn.style.display = 'none';
      continue;
    }

    btn.textContent = '⏳';
    await autoFetchProfile(username, btn, profileCache);

    // Throttle: wait before next fetch
    if (fetchQueue.length > 0) {
      await new Promise(r => setTimeout(r, fetchDelayMs));
    }
  }

  state.isFetching = false;
}

/**
 * Process the followers fetch queue with throttling
 * @param {Array} followersFetchQueue - Followers queue array
 * @param {Object} state - State object containing flags and settings
 * @param {Map} profileCache - Profile cache
 * @param {number} fetchDelayMs - Delay between fetches
 */
export async function processFollowersFetchQueue(followersFetchQueue, state, profileCache, fetchDelayMs) {
  if (state.isFetchingFollowers || followersFetchQueue.length === 0) return;

  // Check if auto-query followers is disabled
  if (!state.autoQueryFollowersEnabled) {
    return;
  }

  // Check if rate limited
  if (Date.now() < state.rateLimitedUntil) {
    return;
  }

  state.isFetchingFollowers = true;

  while (followersFetchQueue.length > 0) {
    // Stop processing if user is logged out
    if (state.isUserLoggedIn === false) {
      console.log('[Threads Extractor] User logged out. Stopping followers queue processing.');
      followersFetchQueue.length = 0;
      break;
    }

    // Check rate limit before each fetch
    if (Date.now() < state.rateLimitedUntil) {
      console.log('[Threads Extractor] Rate limit triggered. Stopping followers queue processing.');
      break;
    }

    const { username, btn } = followersFetchQueue.shift();
    console.log(`[Threads Extractor] Processing follower @${username}, queue length: ${followersFetchQueue.length}`);

    // Skip if already fetched while in queue
    if (profileCache.has(username)) {
      const cached = profileCache.get(username);
      // Check if button still exists in DOM
      if (!btn.parentElement) {
        continue; // Button was removed, skip
      }
      // For followers, replace button with badge
      if (cached.location) {
        const badge = await createLocationBadge(cached);
        btn.parentElement.replaceChild(badge, btn);
      } else {
        btn.textContent = '➖';
        btn.title = 'No location available';
        btn.disabled = true;
        btn.style.cursor = 'default';
        btn.style.opacity = '0.4';
      }
      continue;
    }

    btn.textContent = '⏳';

    // Get the user ID from the button
    const userId = btn.getAttribute('data-userid');
    if (!userId) {
      btn.textContent = '❓';
      btn.title = 'User ID not found';
      continue;
    }

    // Fetch profile info using shared utility
    const profileInfo = await fetchProfileByUserId(userId);

    // Update button with result using shared utility
    await updateButtonWithFetchResult(btn, username, profileInfo, profileCache, createLocationBadge);

    // Throttle: wait before next fetch
    if (followersFetchQueue.length > 0) {
      await new Promise(r => setTimeout(r, fetchDelayMs));
    }
  }

  state.isFetchingFollowers = false;
}
