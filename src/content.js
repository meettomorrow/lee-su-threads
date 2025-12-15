// Content script for Threads Profile Info Extractor
import { findPostContainer, detectActiveTab } from './lib/domHelpers.js';
import { injectLocationUIForUser, createLocationBadge } from './lib/friendshipsUI.js';
import { displayProfileInfo, autoFetchProfile, createProfileBadge } from './lib/postUI.js';
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';

'use strict';

console.log('[Threads Extractor] 🚀 content.js is loading...');

// Cross-browser compatibility: use browser.* API if available (Firefox), fallback to chrome.*
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Initialize country flag emoji polyfill for Windows compatibility (content script context)
// Use local font to avoid CSP issues with CDN
polyfillCountryFlagEmojis("Twemoji Country Flags", browserAPI.runtime.getURL('fonts/TwemojiCountryFlags.woff2'));

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
    displayProfileInfo(profileInfo, profileCache);
  }
});

// Listen for rate limit events
window.addEventListener('threads-rate-limited', () => {
  console.warn('[Threads Extractor] Rate limited! Pausing auto-fetch for 1 hour.');
  rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
  showRateLimitToast();
});

// Keyboard shortcut: Ctrl+Shift+, to open settings
document.addEventListener('keydown', (event) => {
  // Check for Ctrl+Shift+, on all platforms (standard settings shortcut)
  if (event.ctrlKey && event.shiftKey && event.key === ',') {
    event.preventDefault();
    console.log('[Threads Extractor] Opening settings via keyboard shortcut...');

    // Open popup in a new tab
    browserAPI.runtime.sendMessage({ type: 'OPEN_POPUP_TAB' });
  }
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

// Store the last loaded users lists so we can re-inject when dialog reopens
// We store both followers and following separately
let lastFollowersList = [];
let lastFollowingList = [];
let lastFriendshipsList = []; // Fallback for when we can't determine which

// Listen for followers/following list loaded from injected script
window.addEventListener('threads-friendships-list-loaded', (event) => {
  const users = event.detail?.users || [];
  console.log(`[Threads Extractor] Friendships list loaded with ${users.length} users`);

  // Always update the fallback list
  lastFriendshipsList = users;

  // Try to determine if this is followers or following by checking the active tab
  setTimeout(() => {
    const tabs = document.querySelectorAll('[role="tab"]');
    const { isFollowers, isFollowing } = detectActiveTab(tabs);

    if (isFollowers) {
      // Append new users to existing list (for pagination)
      const existingUsernames = new Set(lastFollowersList.map(u => u.username));
      const newUsers = users.filter(u => !existingUsernames.has(u.username));
      if (newUsers.length > 0) {
        lastFollowersList = [...lastFollowersList, ...newUsers];
      }
    } else if (isFollowing) {
      // Append new users to existing list (for pagination)
      const existingUsernames = new Set(lastFollowingList.map(u => u.username));
      const newUsers = users.filter(u => !existingUsernames.has(u.username));
      if (newUsers.length > 0) {
        lastFollowingList = [...lastFollowingList, ...newUsers];
      }
    }
  }, 100);

  // Use MutationObserver to wait for DOM to render
  waitForFriendshipsDOM(users);
});

// Wait for friendships DOM to render, then inject badges
function waitForFriendshipsDOM(users) {
  let attempts = 0;
  const maxAttempts = 20; // Try for up to 10 seconds

  const tryInject = () => {
    attempts++;

    // Check if any user links are now in the DOM
    // Try multiple users from the list to handle pagination
    let foundAny = false;
    for (let i = 0; i < Math.min(3, users.length); i++) {
      const sampleUsername = users[i]?.username;
      if (!sampleUsername) continue;

      const links = document.querySelectorAll(`a[href="/@${sampleUsername}"]`);

      if (links.length > 0) {
        foundAny = true;
        break;
      }
    }

    if (foundAny) {
      // DOM is ready! Inject badges for all users
      injectLocationBadgesIntoFriendshipsList(users);
    } else if (attempts < maxAttempts) {
      // Try again in 500ms
      setTimeout(tryInject, 500);
    }
  };

  tryInject();
}

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

  // Open settings button - opens popup in a new tab
  document.getElementById('threads-open-settings-btn').addEventListener('click', () => {
    // Send message to background script to open popup.html in a new tab
    browserAPI.runtime.sendMessage({ type: 'OPEN_POPUP_TAB' });
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

// Inject location badges into followers/following list
function injectLocationBadgesIntoFriendshipsList(users) {
  for (const user of users) {
    const { pk, username } = user;
    injectLocationUIForUser(username, pk, profileCache);
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
    await autoFetchProfile(username, btn, profileCache);

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

  timeElements.forEach(async timeEl => {
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
        const badge = await createProfileBadge(profileCache.get(username));
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
        btn.textContent = '❓';
        btn.title = 'User ID not found. Try scrolling or clicking on their profile first.';
        btn.disabled = false;
      }
    });

    // Auto-fetch: observe button for visibility
    visibilityObserver.observe(btn);
  });
}

// Observe DOM for new posts AND for friendships dialog reopening/scrolling
function observeFeed() {
  const observer = new MutationObserver((mutations) => {
    // Debounce
    clearTimeout(observer._timeout);
    observer._timeout = setTimeout(() => {
      addFetchButtons();

      // Check if friendships dialog is open
      const dialogOpen = document.querySelector('[role="dialog"]');
      if (dialogOpen) {
        // Determine which list to use by checking active tab
        const tabs = dialogOpen.querySelectorAll('[role="tab"]');

        const { isFollowers: isFollowersTab, isFollowing: isFollowingTab } = detectActiveTab(tabs);

        let activeList = null;
        if (isFollowersTab) {
          activeList = lastFollowersList;
        } else if (isFollowingTab) {
          activeList = lastFollowingList;
        }

        // Fallback to the most recent list if we can't determine
        if (!activeList || activeList.length === 0) {
          activeList = lastFriendshipsList;
        }

        if (activeList && activeList.length > 0 && (isFollowersTab || isFollowingTab)) {
          // Check for user rows without badges (newly loaded from scroll)
          const allUserLinks = dialogOpen.querySelectorAll('a[href^="/@"]');
          let unbadgedCount = 0;

          allUserLinks.forEach(link => {
            const href = link.getAttribute('href');
            const username = href?.match(/^\/@([\w.]+)/)?.[1];

            if (username) {
              // Find the parent row
              let parent = link.parentElement;
              for (let i = 0; i < 15 && parent; i++) {
                if (parent.getAttribute && parent.getAttribute('data-pressable-container') === 'true') {
                  // Check if this row already has a badge or button
                  const hasBadge = parent.querySelector('.threads-friendships-location-badge') ||
                                   parent.querySelector('.threads-friendships-fetch-btn');

                  if (!hasBadge) {
                    unbadgedCount++;
                    // Find the user data
                    const userData = activeList.find(u => u.username === username);

                    if (userData) {
                      // We have the user data with pk from GraphQL
                      injectLocationUIForUser(username, userData.pk, profileCache);
                    } else {
                      // User not in our GraphQL list - try to get user ID from injected script
                      // Request user ID lookup via postMessage
                      const requestId = Math.random().toString(36).substring(7);
                      const getUserIdPromise = new Promise((resolve) => {
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
                        }, 100);
                      });

                      getUserIdPromise.then(userId => {
                        if (userId) {
                          injectLocationUIForUser(username, userId, profileCache);
                        }
                      });
                    }
                  }
                  break;
                }
                parent = parent.parentElement;
              }
            }
          });

        }
      }
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

// Detect Threads theme and store it for popup
let themeObserver = null;

function detectThreadsTheme() {
  function updateTheme() {
    // Check multiple possible attributes/classes that Threads might use
    const html = document.documentElement;
    const body = document.body;

    // Try different detection methods
    let theme = null;

    // Method 1: data-color-mode attribute
    const colorMode = html.getAttribute('data-color-mode');
    if (colorMode) {
      theme = colorMode === 'dark' ? 'dark' : 'light';
    }

    // Method 2: Check computed background color
    if (!theme && body) {
      const bgColor = window.getComputedStyle(body).backgroundColor;
      // Parse RGB and check if it's dark (low values) or light (high values)
      const rgb = bgColor.match(/\d+/g);
      if (rgb && rgb.length >= 3) {
        const brightness = (parseInt(rgb[0]) + parseInt(rgb[1]) + parseInt(rgb[2])) / 3;
        theme = brightness < 128 ? 'dark' : 'light';
      }
    }

    if (theme) {
      browserAPI.storage.local.set({ threadsTheme: theme });
    }

    return theme;
  }

  // Initial detection
  setTimeout(updateTheme, 1000); // Wait for page to fully load

  // Watch for any attribute changes on html and body with debouncing
  let updateTimeout = null;
  themeObserver = new MutationObserver(() => {
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(updateTheme, 100); // Debounce for 100ms
  });

  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-color-mode', 'data-color-scheme', 'data-theme', 'class', 'style']
  });

  if (document.body) {
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style']
    });
  }
}

// Cleanup theme observer on page unload
window.addEventListener('beforeunload', () => {
  if (themeObserver) {
    themeObserver.disconnect();
    themeObserver = null;
  }
}, { once: true });

// Initialize
function init() {
  console.log('[Threads Extractor] Content script loaded');

  // Detect and track Threads theme
  detectThreadsTheme();

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

/**
 * Update all existing badges on the page to reflect showFlags setting change
 */
async function updateBadgesForFlagsChange() {
  // Update post badges
  const postBadges = document.querySelectorAll('.threads-profile-info-badge');
  for (const badge of postBadges) {
    let username = null;

    // Find the associated username from nearby profile links
    const postContainer = badge.closest('[role="article"]') || badge.parentElement?.closest('div');
    if (postContainer) {
      const profileLink = postContainer.querySelector('a[href^="/@"]');
      if (profileLink) {
        const href = profileLink.getAttribute('href');
        const match = href.match(/^\/@([\w.]+)/);
        if (match) username = match[1];
      }
    }

    // Replace with updated badge
    if (username && profileCache.has(username)) {
      const profileInfo = profileCache.get(username);
      const newBadge = await createProfileBadge(profileInfo);
      badge.parentElement?.replaceChild(newBadge, badge);
    }
  }

  // Update friendships location badges
  const friendshipBadges = document.querySelectorAll('.threads-friendships-location-badge');
  for (const badge of friendshipBadges) {
    let username = null;

    // Find username from nearby profile link
    const container = badge.parentElement?.parentElement;
    if (container) {
      const profileLink = container.querySelector('a[href^="/@"]');
      if (profileLink) {
        const href = profileLink.getAttribute('href');
        const match = href.match(/^\/@([\w.]+)/);
        if (match) username = match[1];
      }
    }

    // Replace with updated badge
    if (username && profileCache.has(username)) {
      const profileInfo = profileCache.get(username);
      const newBadge = await createLocationBadge(profileInfo);
      badge.parentElement?.replaceChild(newBadge, badge);
    }
  }

  console.log('[Threads Extractor] Updated all badges for flags change');
}

// Listen for setting changes from popup
browserAPI.runtime.onMessage.addListener((message) => {
  if (message.type === 'AUTO_QUERY_CHANGED') {
    autoQueryEnabled = message.enabled;
    console.log('[Threads Extractor] Auto-query', autoQueryEnabled ? 'enabled' : 'disabled');
    if (autoQueryEnabled) {
      processFetchQueue();
    }
  } else if (message.type === 'SHOW_FLAGS_CHANGED') {
    console.log('[Threads Extractor] Show flags', message.enabled ? 'enabled' : 'disabled');
    // Update all existing badges on the page
    updateBadgesForFlagsChange();
  }
});

// Wait for DOM to be ready
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init);
} else {
init();
}
