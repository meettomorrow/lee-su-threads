// Background service worker for Threads Profile Info Extractor

// Cross-browser compatibility: use browser.* API if available (Firefox), fallback to chrome.*
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const USER_ID_CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days for user ID mapping

// Handle async message responses for both Chrome and Firefox
function handleAsyncMessage(message, sender, sendResponse) {
  if (message.type === 'PROFILE_INFO_EXTRACTED') {
    console.log('[Threads Extractor] Profile info received:', message.data);

    // Store the profile info
    browserAPI.storage.local.get(['profileCache']).then((result) => {
      const cache = result.profileCache || {};
      const username = message.data.username;
      if (username) {
        cache[username] = {
          ...message.data,
          timestamp: Date.now()
        };
        browserAPI.storage.local.set({ profileCache: cache });
      }
    });
    return false;
  }

  if (message.type === 'GET_CACHED_PROFILES') {
    browserAPI.storage.local.get(['profileCache']).then((result) => {
      sendResponse(result.profileCache || {});
    });
    return true; // Keep channel open for async response
  }

  // Store user ID mappings (username -> userId)
  if (message.type === 'STORE_USER_IDS') {
    const userIds = message.data; // { username: userId, ... }
    browserAPI.storage.local.get(['userIdCache']).then((result) => {
      const cache = result.userIdCache || {};
      const now = Date.now();
      for (const [username, userId] of Object.entries(userIds)) {
        if (!cache[username]) {
          cache[username] = { userId, timestamp: now };
        }
      }
      browserAPI.storage.local.set({ userIdCache: cache });
    });
    return false;
  }

  // Get cached user IDs
  if (message.type === 'GET_USER_ID_CACHE') {
    browserAPI.storage.local.get(['userIdCache']).then((result) => {
      sendResponse(result.userIdCache || {});
    });
    return true; // Keep channel open for async response
  }

  return false;
}

// Listen for messages from content script
browserAPI.runtime.onMessage.addListener(handleAsyncMessage);

// Clean up old cache entries on startup
browserAPI.runtime.onStartup.addListener(() => {
  const now = Date.now();
  const profileMaxAge = 72 * 60 * 60 * 1000; // 72 hours for profiles

  // Clean profile cache
  browserAPI.storage.local.get(['profileCache']).then((result) => {
    const cache = result.profileCache || {};
    const cleanedCache = {};
    for (const [username, data] of Object.entries(cache)) {
      if (now - data.timestamp < profileMaxAge) {
        cleanedCache[username] = data;
      }
    }
    browserAPI.storage.local.set({ profileCache: cleanedCache });
  });

  // Clean user ID cache (30 days)
  browserAPI.storage.local.get(['userIdCache']).then((result) => {
    const cache = result.userIdCache || {};
    const cleanedCache = {};
    for (const [username, data] of Object.entries(cache)) {
      if (now - data.timestamp < USER_ID_CACHE_MAX_AGE) {
        cleanedCache[username] = data;
      }
    }
    browserAPI.storage.local.set({ userIdCache: cleanedCache });
  });
});
