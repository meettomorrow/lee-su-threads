/**
 * IntersectionObserver instances for auto-fetching profiles
 * Handles visibility detection for both feed posts and followers/following
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

/**
 * Create IntersectionObserver for feed posts
 * @param {Function} queueFeedFetch - Function to queue feed fetches
 * @param {Map} pendingVisibility - Map tracking pending visibility timers
 * @param {Map} profileCache - Profile cache
 * @param {Object} state - State object with isUserLoggedIn flag
 * @param {number} visibilityDelayMs - Delay before queuing
 * @returns {IntersectionObserver}
 */
export function createFeedVisibilityObserver(queueFeedFetch, pendingVisibility, profileCache, state, visibilityDelayMs) {
  return new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const btn = entry.target;
      const username = btn.getAttribute('data-username');
      if (!username) return;

      if (entry.isIntersecting) {
        // Skip auto-fetch if user is logged out
        if (state.isUserLoggedIn === false) {
          // Mark button as login-required without fetching
          btn.textContent = '🔒';
          btn.title = browserAPI.i18n.getMessage('loginRequired') || 'Login required. Click to learn more.';
          btn.setAttribute('data-login-required', 'true');
          entry.target.observer?.unobserve?.(btn);
          return;
        }

        // Post entered viewport - start delay timer
        if (!pendingVisibility.has(username) && !profileCache.has(username)) {
          const timeoutId = setTimeout(() => {
            // Still visible after delay? Queue it
            if (pendingVisibility.has(username)) {
              pendingVisibility.delete(username);
              queueFeedFetch(username, btn);
              entry.target.observer?.unobserve?.(btn);
            }
          }, visibilityDelayMs);
          pendingVisibility.set(username, timeoutId);
        }
      } else {
        // Post left viewport - cancel pending timer
        if (pendingVisibility.has(username)) {
          clearTimeout(pendingVisibility.get(username));
          pendingVisibility.delete(username);
        }
      }
    });
  }, { threshold: 0.1 });
}

/**
 * Create IntersectionObserver for followers/following
 * @param {Function} queueFollowersFetch - Function to queue follower fetches
 * @param {Map} pendingFollowersVisibility - Map tracking pending visibility timers
 * @param {Map} profileCache - Profile cache
 * @param {Object} state - State object with flags
 * @param {number} visibilityDelayMs - Delay before queuing
 * @returns {IntersectionObserver}
 */
export function createFollowersVisibilityObserver(queueFollowersFetch, pendingFollowersVisibility, profileCache, state, visibilityDelayMs) {
  return new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const btn = entry.target;
      const username = btn.getAttribute('data-username');
      const userId = btn.getAttribute('data-userid');
      if (!username || !userId) return;

      if (entry.isIntersecting) {
        // Skip auto-fetch if followers auto-query is disabled
        if (!state.autoQueryFollowersEnabled) {
          return;
        }

        // Skip auto-fetch if user is logged out
        if (state.isUserLoggedIn === false) {
          btn.textContent = '🔒';
          btn.title = browserAPI.i18n.getMessage('loginRequired') || 'Login required. Click to learn more.';
          btn.setAttribute('data-login-required', 'true');
          entry.target.observer?.unobserve?.(btn);
          return;
        }

        // User row entered viewport - start delay timer
        if (!pendingFollowersVisibility.has(username) && !profileCache.has(username)) {
          const timeoutId = setTimeout(() => {
            // Still visible after delay? Queue the fetch
            if (pendingFollowersVisibility.has(username)) {
              pendingFollowersVisibility.delete(username);
              // Add to followers fetch queue
              queueFollowersFetch(username, btn);
              entry.target.observer?.unobserve?.(btn);
            }
          }, visibilityDelayMs);
          pendingFollowersVisibility.set(username, timeoutId);
        }
      } else {
        // User row left viewport - cancel pending timer
        if (pendingFollowersVisibility.has(username)) {
          clearTimeout(pendingFollowersVisibility.get(username));
          pendingFollowersVisibility.delete(username);
        }
      }
    });
  }, { threshold: 0.1 });
}
