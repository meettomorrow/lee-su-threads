// Background service worker for Threads Profile Info Extractor

// Cross-browser compatibility: use browser.* API if available (Firefox), fallback to chrome.*
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Import version utilities
import { compareVersions, shouldShowOnboarding } from './lib/versionUtils.js';

const USER_ID_CACHE_MAX_AGE = 60 * 24 * 60 * 60 * 1000; // 60 days for user ID mapping
const PROFILE_WITH_LOCATION_MAX_AGE = 21 * 24 * 60 * 60 * 1000; // 21 days for profiles with location
const PROFILE_NO_LOCATION_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours (1 day) for profiles without location

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
      const cache = result.profileCache || {};
      const now = Date.now();
      const validCache = {};

      // Filter out expired entries based on different TTLs
      for (const [username, data] of Object.entries(cache)) {
        const maxAge = data.location ? PROFILE_WITH_LOCATION_MAX_AGE : PROFILE_NO_LOCATION_MAX_AGE;
        if (now - data.timestamp < maxAge) {
          validCache[username] = data;
        }
      }

      sendResponse(validCache);
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

  // Open onboarding page
  if (message.type === 'OPEN_ONBOARDING') {
    browserAPI.tabs.create({
      url: browserAPI.runtime.getURL('onboarding.html')
    });
    return false;
  }

  // Open popup in a new tab
  if (message.type === 'OPEN_POPUP_TAB') {
    browserAPI.tabs.create({
      url: browserAPI.runtime.getURL('popup.html')
    });
    return false;
  }

  // Open popup in a new tab with URL (for location pre-selection)
  // Reuse existing popup tab if one exists
  if (message.type === 'OPEN_POPUP_IN_TAB') {
    const popupUrl = browserAPI.runtime.getURL('popup.html');

    // Find existing popup tab
    browserAPI.tabs.query({ url: popupUrl + '*' }).then((tabs) => {
      if (tabs.length > 0) {
        // Reuse existing tab - update URL and focus it
        browserAPI.tabs.update(tabs[0].id, {
          url: message.url,
          active: true
        });
        browserAPI.windows.update(tabs[0].windowId, { focused: true });
      } else {
        // Create new tab
        browserAPI.tabs.create({
          url: message.url
        });
      }
    });
    return false;
  }

  return false;
}

// Listen for messages from content script
browserAPI.runtime.onMessage.addListener(handleAsyncMessage);

// Version-based onboarding system
// Set this to the minimum version that should see the onboarding page
// Example: '0.4.0' means users upgrading from <0.4.0 will see onboarding once
const ONBOARDING_MIN_VERSION = '0.3.5';

// Show onboarding page on first install or version-based updates
browserAPI.runtime.onInstalled.addListener((details) => {
  const currentVersion = browserAPI.runtime.getManifest().version;

  if (details.reason === 'install') {
    // First install - always show onboarding
    browserAPI.tabs.create({
      url: browserAPI.runtime.getURL('onboarding.html')
    });
    browserAPI.storage.local.set({ onboardingLastSeenVersion: currentVersion });
  } else if (details.reason === 'update') {
    // Check version-based onboarding
    browserAPI.storage.local.get(['onboardingLastSeenVersion']).then((result) => {
      const lastSeenVersion = result.onboardingLastSeenVersion;

      if (shouldShowOnboarding(lastSeenVersion, ONBOARDING_MIN_VERSION)) {
        browserAPI.tabs.create({
          url: browserAPI.runtime.getURL('onboarding.html')
        });
        browserAPI.storage.local.set({ onboardingLastSeenVersion: currentVersion });
      } else {
        // Still update the version even if we don't show onboarding
        browserAPI.storage.local.set({ onboardingLastSeenVersion: currentVersion });
      }
    });
  }
});

// Clean up old cache entries on startup
browserAPI.runtime.onStartup.addListener(() => {
  const now = Date.now();

  // Clean profile cache with different TTLs based on location data
  browserAPI.storage.local.get(['profileCache']).then((result) => {
    const cache = result.profileCache || {};
    const cleanedCache = {};
    for (const [username, data] of Object.entries(cache)) {
      // Use different max age depending on whether location exists
      const maxAge = data.location ? PROFILE_WITH_LOCATION_MAX_AGE : PROFILE_NO_LOCATION_MAX_AGE;
      if (now - data.timestamp < maxAge) {
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
