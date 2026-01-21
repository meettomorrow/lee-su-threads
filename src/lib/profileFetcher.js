/**
 * Shared utility functions for fetching profile data and user IDs
 */

/**
 * Fetch profile information by user ID using postMessage to injected script
 * @param {string} userId - The user ID to fetch profile for
 * @param {number} timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns {Promise<Object|null>} Profile info object or null if failed
 */
export async function fetchProfileByUserId(userId, timeoutMs = 10000) {
  const fetchRequestId = Math.random().toString(36).substring(7);

  return new Promise((resolve) => {
    const handler = (event) => {
      if (event.data?.type === 'threads-fetch-response' &&
          event.data?.requestId === fetchRequestId) {
        window.removeEventListener('message', handler);
        resolve(event.data.result);
      }
    };
    window.addEventListener('message', handler);

    window.postMessage({
      type: 'threads-fetch-request',
      requestId: fetchRequestId,
      userId: userId
    }, '*');

    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(null);
    }, timeoutMs);
  });
}

/**
 * Look up user ID by username using postMessage to injected script
 * @param {string} username - The username to look up (without @)
 * @param {number} timeoutMs - Timeout in milliseconds (default: 2000)
 * @returns {Promise<string|null>} User ID or null if not found
 */
export async function getUserIdByUsername(username, timeoutMs = 2000) {
  const requestId = Math.random().toString(36).substring(7);

  return new Promise((resolve) => {
    const handler = (event) => {
      if (event.data?.type === 'threads-userid-response' &&
          event.data?.requestId === requestId) {
        window.removeEventListener('message', handler);
        resolve(event.data.userId);
      }
    };
    window.addEventListener('message', handler);

    window.postMessage({
      type: 'threads-userid-request',
      requestId: requestId,
      username: username
    }, '*');

    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(null);
    }, timeoutMs);
  });
}

/**
 * Update button with fetch result - replace with badge or show error state
 * @param {HTMLButtonElement} btn - The button element to update
 * @param {string} username - Username (without @)
 * @param {Object|null} profileInfo - Profile info object or null if failed
 * @param {Map} profileCache - Cache to store profile data
 * @param {Function} createBadgeFunc - Function to create badge element (async)
 * @returns {Promise<void>}
 */
export async function updateButtonWithFetchResult(btn, username, profileInfo, profileCache, createBadgeFunc) {
  if (profileInfo && !profileInfo._rateLimited && !profileInfo._loginRequired) {
    profileCache.set(username, profileInfo);

    // Replace button with badge
    if (profileInfo.location) {
      const badge = await createBadgeFunc(profileInfo);
      btn.parentElement.replaceChild(badge, btn);
    } else {
      // No location data
      btn.textContent = '➖';
      btn.title = 'No location available';
      btn.disabled = true;
      btn.style.cursor = 'default';
      btn.style.opacity = '0.4';
    }
  } else if (profileInfo?._rateLimited) {
    btn.textContent = '⏸';
    btn.title = 'Rate limited. Try again later.';
    btn.disabled = false;
  } else if (profileInfo?._loginRequired) {
    btn.textContent = '🔒';
    btn.title = 'Login required. Click to learn more.';
    btn.disabled = false;
    btn.setAttribute('data-login-required', 'true');
  } else {
    btn.textContent = '🔄';
    btn.title = 'Failed. Click to retry.';
    btn.disabled = false;
  }
}
