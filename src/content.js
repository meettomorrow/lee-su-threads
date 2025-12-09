// Content script for Threads Profile Info Extractor
import { parseJoinedDate, isNewUser } from './lib/dateParser.js';

'use strict';

// Cross-browser compatibility: use browser.* API if available (Firefox), fallback to chrome.*
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Store extracted profiles
const profileCache = new Map();

// Auto-fetch queue and throttling
const fetchQueue = [];
let isFetching = false;
let autoFetchReady = false; // Wait for initial data to load
let autoQueryEnabled = true; // User preference for auto-query
let rateLimitedUntil = 0; // Timestamp when rate limit cooldown ends
const FETCH_DELAY_MS = 800; // Delay between auto-fetches to avoid rate limiting
const INITIAL_DELAY_MS = 2000; // Wait for bulk-route-definitions to load
const RATE_LIMIT_COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes (1 hour) cooldown
const MAX_QUEUE_SIZE = 5; // Maximum number of posts in queue
const VISIBILITY_DELAY_MS = 500; // How long a post must be visible before queuing
const pendingVisibility = new Map(); // Track posts waiting to be queued

// Inject the network interceptor script
function injectScript() {
  const script = document.createElement('script');
  script.src = browserAPI.runtime.getURL('injected.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

// Listen for profile data from injected script
window.addEventListener('threads-profile-extracted', (event) => {
  const profileInfo = event.detail;
  if (profileInfo && profileInfo.username) {
    profileCache.set(profileInfo.username, profileInfo);

    // Send to background script for persistent storage
    browserAPI.runtime.sendMessage({
      type: 'PROFILE_INFO_EXTRACTED',
      data: profileInfo
    });

    // Update UI with new profile info
    displayProfileInfo(profileInfo);
  }
});

// Listen for rate limit events
window.addEventListener('threads-rate-limited', () => {
  console.warn('[Threads Extractor] Rate limited! Pausing auto-fetch for 1 hour.');
  rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
  showRateLimitToast();
});

// Listen for new user ID discoveries from injected script and persist them
window.addEventListener('message', (event) => {
  if (event.data?.type === 'threads-new-user-ids') {
    const newUserIds = event.data.data;
    if (newUserIds && Object.keys(newUserIds).length > 0) {
      browserAPI.runtime.sendMessage({ type: 'STORE_USER_IDS', data: newUserIds });
    }
  }
});

// Show rate limit toast notification
function showRateLimitToast() {
  // Remove existing toast if any
  const existing = document.getElementById('threads-rate-limit-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'threads-rate-limit-toast';
  const warningMsg = browserAPI.i18n.getMessage('rateLimitWarning') || '⚠️ Too many location queries. Rate limited by Threads.';
  const popupHintMsg = browserAPI.i18n.getMessage('rateLimitPopupHint') || 'You can turn off auto-query in the popup.';
  const openSettingsMsg = browserAPI.i18n.getMessage('rateLimitOpenSettings') || 'How to Use';

  const warningSpan = document.createElement('span');
  warningSpan.textContent = warningMsg;

  const hintSpan = document.createElement('span');
  hintSpan.className = 'threads-rate-limit-hint';
  hintSpan.textContent = popupHintMsg;

  const openSettingsBtn = document.createElement('button');
  openSettingsBtn.id = 'threads-open-settings-btn';
  openSettingsBtn.textContent = openSettingsMsg;

  const dismissBtn = document.createElement('button');
  dismissBtn.id = 'threads-dismiss-toast';
  dismissBtn.textContent = '✕';

  toast.appendChild(warningSpan);
  toast.appendChild(hintSpan);
  toast.appendChild(openSettingsBtn);
  toast.appendChild(dismissBtn);
  document.body.appendChild(toast);

  // Open settings button - opens onboarding page with instructions
  document.getElementById('threads-open-settings-btn').addEventListener('click', () => {
    // Send message to background script to open the onboarding page
    browserAPI.runtime.sendMessage({ type: 'OPEN_ONBOARDING' });
  });

  // Dismiss button
  document.getElementById('threads-dismiss-toast').addEventListener('click', () => {
    toast.remove();
  });

  // Auto-hide after cooldown ends
  setTimeout(() => {
    if (toast.parentElement) {
      toast.remove();
    }
  }, RATE_LIMIT_COOLDOWN_MS);
}

// Create and display profile info badge
function displayProfileInfo(profileInfo) {
  const username = profileInfo.username;

  // Find all fetch buttons for this user
  const buttons = document.querySelectorAll(`.threads-fetch-btn[data-username="${username}"]`);

  buttons.forEach(btn => {
    // Check if we already added a badge next to this button
    if (btn.previousElementSibling?.classList?.contains('threads-profile-info-badge')) return;

    // Create the info badge and insert before the button (so it appears to the left)
    const badge = createProfileBadge(profileInfo);
    btn.parentElement?.insertBefore(badge, btn);

    // Hide button after success - badge shows the info
    btn.style.display = 'none';
  });
}

// Find the post container element
function findPostContainer(element) {
  let current = element;
  let depth = 0;
  const maxDepth = 15;

  while (current && depth < maxDepth) {
    // Look for common post container patterns
    if (current.getAttribute &&
        (current.getAttribute('data-pressable-container') === 'true' ||
         current.classList?.contains('x1lliihq') ||
         current.tagName === 'ARTICLE')) {
      return current;
    }
    current = current.parentElement;
    depth++;
  }

  return null;
}


// Create the profile info badge element - simple location only
function createProfileBadge(profileInfo) {
  const badge = document.createElement('span');
  badge.className = 'threads-profile-info-badge';

  const joinedLabel = browserAPI.i18n.getMessage('joined') || 'Joined';
  const isNew = isNewUser(profileInfo.joined);
  const newLabel = browserAPI.i18n.getMessage('newUser') || 'NEW';

  if (profileInfo.location) {
    badge.textContent = profileInfo.location;
    badge.title = `${joinedLabel}: ${profileInfo.joined || 'Unknown'}`;
  } else {
    // Location not available
    const noLocationText = browserAPI.i18n.getMessage('noLocation') || 'No location';
    badge.textContent = noLocationText;
    badge.title = profileInfo.joined ? `${joinedLabel}: ${profileInfo.joined}` : noLocationText;
  }

  // Add [NEW] label for new users (skip if verified)
  if (isNew && !profileInfo.isVerified) {
    const newTag = document.createElement('span');
    newTag.className = 'threads-new-user-tag';
    newTag.textContent = `[${newLabel}]`;
    badge.appendChild(newTag);
  }

  return badge;
}


// Auto-fetch profile info for a username
async function autoFetchProfile(username, btn) {
  // Skip if already cached
  if (profileCache.has(username)) {
    const cached = profileCache.get(username);
    displayProfileInfo(cached);
    btn.style.display = 'none';
    return;
  }

  // Request user ID lookup
  const requestId = Math.random().toString(36).substring(7);
  const userId = await new Promise((resolve) => {
    const handler = (event) => {
      if (event.data?.type === 'threads-userid-response' && event.data?.requestId === requestId) {
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
    }, 2000);
  });

  if (!userId) {
    btn.textContent = '❓';
    btn.title = 'User ID not found. Click to retry.';
    btn.disabled = false;
    return;
  }

  // Request profile fetch
  const fetchRequestId = Math.random().toString(36).substring(7);
  const result = await new Promise((resolve) => {
    const handler = (event) => {
      if (event.data?.type === 'threads-fetch-response' && event.data?.requestId === fetchRequestId) {
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
    }, 10000);
  });

  if (result) {
    if (result._rateLimited) {
      // Rate limited - button will show retry
      btn.textContent = '🔄';
      btn.title = 'Rate limited. Click to retry later.';
      btn.disabled = false;
    } else {
      btn.style.display = 'none';
    }
  } else {
    btn.textContent = '🔄';
    btn.title = 'Failed to load. Click to retry.';
    btn.disabled = false;
  }
}

// Process the fetch queue with throttling
async function processFetchQueue() {
  if (isFetching || fetchQueue.length === 0) return;

  // Check if auto-query is disabled
  if (!autoQueryEnabled) {
    console.log('[Threads Extractor] Auto-query disabled. Skipping queue processing.');
    return;
  }

  // Check if rate limited
  if (Date.now() < rateLimitedUntil) {
    console.log('[Threads Extractor] Rate limit cooldown active. Skipping queue processing.');
    return;
  }

  isFetching = true;

  while (fetchQueue.length > 0) {
    // Check rate limit before each fetch
    if (Date.now() < rateLimitedUntil) {
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
    await autoFetchProfile(username, btn);

    // Throttle: wait before next fetch
    if (fetchQueue.length > 0) {
      await new Promise(r => setTimeout(r, FETCH_DELAY_MS));
    }
  }

  isFetching = false;
}

// Queue a profile for auto-fetch
function queueAutoFetch(username, btn) {
  // Don't queue if already cached
  if (profileCache.has(username)) return;

  // Check if already in queue
  const existingIndex = fetchQueue.findIndex(item => item.username === username);
  if (existingIndex !== -1) {
    // Already in queue - move to front (prioritize recently visible)
    const existing = fetchQueue.splice(existingIndex, 1)[0];
    fetchQueue.unshift(existing);
    return;
  }

  // Add to front of queue (newest visible posts get priority)
  fetchQueue.unshift({ username, btn });

  // Trim queue if it exceeds max size (remove oldest items from the back)
  while (fetchQueue.length > MAX_QUEUE_SIZE) {
    const removed = fetchQueue.pop();
    // Re-observe removed items so they can be re-queued if scrolled back
    if (removed && removed.btn) {
      visibilityObserver.observe(removed.btn);
    }
  }

  // Only start processing if ready (initial delay passed)
  if (autoFetchReady) {
    processFetchQueue();
  }
}

// Intersection Observer for auto-fetching visible posts
const visibilityObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const btn = entry.target;
    const username = btn.getAttribute('data-username');
    if (!username) return;

    if (entry.isIntersecting) {
      // Post entered viewport - start delay timer
      if (!pendingVisibility.has(username) && !profileCache.has(username)) {
        const timeoutId = setTimeout(() => {
          // Still visible after delay? Queue it
          if (pendingVisibility.has(username)) {
            pendingVisibility.delete(username);
            queueAutoFetch(username, btn);
            visibilityObserver.unobserve(btn);
          }
        }, VISIBILITY_DELAY_MS);
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

// Add "Get Info" buttons after the time element on posts
function addFetchButtons() {
  // Find all time elements that haven't been processed
  const timeElements = document.querySelectorAll('time:not([data-threads-info-added])');

  timeElements.forEach(timeEl => {
    // Mark as processed
    timeEl.setAttribute('data-threads-info-added', 'true');

    // Find the post container
    const postContainer = findPostContainer(timeEl);
    if (!postContainer) return;

    // Skip if we already added a button to this post
    if (postContainer.querySelector('.threads-fetch-btn')) return;

    // Find the username for this post
    const profileLink = postContainer.querySelector('a[href^="/@"]');
    if (!profileLink) return;

    const href = profileLink.getAttribute('href');
    const match = href.match(/^\/@([\w.]+)/);
    if (!match) return;

    const username = match[1];

    // Skip if we already have this profile cached and displayed
    if (profileCache.has(username) && postContainer.querySelector('.threads-profile-info-badge')) return;

    // If we have cached data for this user, display badge directly without creating button
    if (profileCache.has(username)) {
      const timeParent = timeEl.closest('span') || timeEl.parentElement;
      if (timeParent?.parentElement) {
        timeParent.parentElement.style.alignItems = 'center';
        const badge = createProfileBadge(profileCache.get(username));
        timeParent.parentElement.insertBefore(badge, timeParent.nextSibling);
      }
      return;
    }

    // Create the fetch button for uncached users
    const btn = document.createElement('button');
    btn.className = 'threads-fetch-btn';
    btn.textContent = '📍';
    btn.title = `Get location for @${username}`;
    btn.setAttribute('data-username', username);

    // Insert button after the time element
    const timeParent = timeEl.closest('span') || timeEl.parentElement;
    if (timeParent) {
      // Ensure vertical alignment of the row
      if (timeParent.parentElement) {
        timeParent.parentElement.style.alignItems = 'center';
      }

      timeParent.parentElement?.insertBefore(btn, timeParent.nextSibling);
    }

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      btn.disabled = true;
      btn.textContent = '⏳';

      // Use postMessage to communicate with injected script
      const requestId = Math.random().toString(36).substring(7);

      // Request user ID lookup
      const userId = await new Promise((resolve) => {
        const handler = (event) => {
          if (event.data?.type === 'threads-userid-response' && event.data?.requestId === requestId) {
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
        }, 2000);
      });

      if (userId) {
        console.log(`[Threads Extractor] Found user ID for @${username}: ${userId}`);

        // Request profile fetch
        const fetchRequestId = Math.random().toString(36).substring(7);
        const result = await new Promise((resolve) => {
          const handler = (event) => {
            if (event.data?.type === 'threads-fetch-response' && event.data?.requestId === fetchRequestId) {
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

          // Timeout after 10 seconds
          setTimeout(() => {
            window.removeEventListener('message', handler);
            resolve(null);
          }, 10000);
        });

        if (result) {
          btn.style.display = 'none';
        } else {
          btn.textContent = '🔄';
          btn.title = 'Failed to load. Click to retry.';
          btn.disabled = false;
        }
      } else {
        console.log(`[Threads Extractor] Could not find user ID for @${username}`);
        btn.textContent = '❓';
        btn.title = 'User ID not found. Try scrolling or clicking on their profile first.';
        btn.disabled = false;
      }
    });

    // Auto-fetch: observe button for visibility
    visibilityObserver.observe(btn);
  });
}

// Try to find user ID for a username by looking at page data
async function findUserIdForUsername(username) {
  // Check the global map first
  const userIdMap = window.__threadsUserIdMap;
  if (userIdMap?.has(username)) {
    return userIdMap.get(username);
  }

  // Try to find in React fiber/props (Threads uses React)
  const profileLink = document.querySelector(`a[href="/@${username}"]`);
  if (profileLink) {
    // Walk up to find data
    let element = profileLink;
    for (let i = 0; i < 20 && element; i++) {
      // Check for React fiber
      const keys = Object.keys(element);
      for (const key of keys) {
        if (key.startsWith('__reactFiber') || key.startsWith('__reactProps')) {
          try {
            const fiber = element[key];
            const userId = findUserIdInObject(fiber, username);
            if (userId) return userId;
          } catch (e) { /* ignore */ }
        }
      }
      element = element.parentElement;
    }
  }

  return null;
}

// Recursively search for user ID in an object
function findUserIdInObject(obj, targetUsername, depth = 0) {
  if (depth > 15 || !obj || typeof obj !== 'object') return null;

  // Check if this object has both username and id/pk
  if (obj.username === targetUsername) {
    if (obj.id && String(obj.id).match(/^\d+$/)) return String(obj.id);
    if (obj.pk && String(obj.pk).match(/^\d+$/)) return String(obj.pk);
    if (obj.user_id && String(obj.user_id).match(/^\d+$/)) return String(obj.user_id);
  }

  // Check user object
  if (obj.user && obj.user.username === targetUsername) {
    if (obj.user.id) return String(obj.user.id);
    if (obj.user.pk) return String(obj.user.pk);
  }

  // Recurse
  for (const key of Object.keys(obj)) {
    if (key.startsWith('_') && key !== '_owner') continue; // Skip internal React props
    try {
      const result = findUserIdInObject(obj[key], targetUsername, depth + 1);
      if (result) return result;
    } catch (e) { /* ignore circular refs */ }
  }

  return null;
}

// Observe DOM for new posts
function observeFeed() {
  const observer = new MutationObserver((mutations) => {
    // Debounce
    clearTimeout(observer._timeout);
    observer._timeout = setTimeout(() => {
      addFetchButtons();
    }, 500);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    clearTimeout(observer._timeout);
    observer.disconnect();
  }, { once: true });
}

// Initialize
function init() {
  console.log('[Threads Extractor] Content script loaded');

  // Inject network interceptor
  injectScript();

  // Add fetch buttons to existing posts
  setTimeout(addFetchButtons, 1000);

  // Observe for new posts
  observeFeed();

  // Load cached profiles from storage
  browserAPI.runtime.sendMessage({ type: 'GET_CACHED_PROFILES' }).then((cachedProfiles) => {
    if (cachedProfiles) {
      for (const [username, data] of Object.entries(cachedProfiles)) {
        profileCache.set(username, data);
      }
    }
  }).catch((err) => {
    console.warn('[Threads Extractor] Failed to load cached profiles:', err);
  });

  // Load cached user IDs and pass to injected script
  browserAPI.runtime.sendMessage({ type: 'GET_USER_ID_CACHE' }).then((cachedUserIds) => {
    if (cachedUserIds && Object.keys(cachedUserIds).length > 0) {
      const userIdMap = {};
      for (const [username, data] of Object.entries(cachedUserIds)) {
        userIdMap[username] = data.userId;
      }
      console.log(`[Threads Extractor] Loaded ${Object.keys(userIdMap).length} cached user IDs`);
      // Pass to injected script
      window.postMessage({ type: 'threads-load-userid-cache', data: userIdMap }, '*');
    }
  }).catch((err) => {
    console.warn('[Threads Extractor] Failed to load cached user IDs:', err);
  });

  // Enable auto-fetch after initial delay (wait for bulk-route-definitions to load)
  setTimeout(() => {
    autoFetchReady = true;
    console.log('[Threads Extractor] Auto-fetch enabled');
    processFetchQueue(); // Process any queued items
  }, INITIAL_DELAY_MS);
}

// Load auto-query setting from storage
browserAPI.storage.local.get(['autoQueryEnabled']).then((result) => {
  autoQueryEnabled = result.autoQueryEnabled !== false;
});

// Listen for setting changes from popup
browserAPI.runtime.onMessage.addListener((message) => {
  if (message.type === 'AUTO_QUERY_CHANGED') {
    autoQueryEnabled = message.enabled;
    console.log('[Threads Extractor] Auto-query', autoQueryEnabled ? 'enabled' : 'disabled');
    if (autoQueryEnabled) {
      processFetchQueue();
    }
  }
});

// Wait for DOM to be ready
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init);
} else {
init();
}
