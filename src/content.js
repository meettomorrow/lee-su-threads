// Content script for Threads Profile Info Extractor
import { findPostContainer, detectActiveTab, isUserListContext, findFollowButtonContainer, findUsernameFromTimeElement } from './lib/domHelpers.js';
import { injectLocationUIForUser, createLocationBadge } from './lib/friendshipsUI.js';
import { displayProfileInfo, autoFetchProfile, createProfileBadge } from './lib/postUI.js';
import { isSingleUserNotification, findIconElement, extractIconColor } from './lib/notificationDetector.js';
import { fetchProfileByUserId, getUserIdByUsername, updateButtonWithFetchResult } from './lib/profileFetcher.js';
import { showRateLimitToast, showLoginRequiredBanner } from './lib/notifications.js';
import { queueFetch, processFetchQueue, processFollowersFetchQueue } from './lib/queueManager.js';
import { createFeedVisibilityObserver, createFollowersVisibilityObserver } from './lib/autoFetchObservers.js';
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
const followersFetchQueue = [];
const pendingVisibility = new Map(); // Track posts waiting to be queued
const pendingFollowersVisibility = new Map(); // Track followers waiting to be queued

// Constants
const FETCH_DELAY_MS = 800; // Delay between auto-fetches to avoid rate limiting
const INITIAL_DELAY_MS = 2000; // Wait for bulk-route-definitions to load
const RATE_LIMIT_COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes (1 hour) cooldown
const MAX_QUEUE_SIZE = 10; // Maximum number of posts in queue
const VISIBILITY_DELAY_MS = 500; // How long a post must be visible before queuing

// Shared state object for queue manager and observers
const state = {
  isFetching: false,
  isFetchingFollowers: false,
  autoFetchReady: false, // Wait for initial data to load
  autoQueryEnabled: true, // User preference for auto-query
  autoQueryFollowersEnabled: false, // User preference for auto-query followers (default off)
  rateLimitedUntil: 0, // Timestamp when rate limit cooldown ends
  isUserLoggedIn: null // null = unknown, true = logged in, false = logged out
}

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
  state.rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
  showRateLimitToast(RATE_LIMIT_COOLDOWN_MS);
});

// Listen for login required events
window.addEventListener('threads-show-login-banner', () => {
  console.warn('[Threads Extractor] Login required - showing banner');
  showLoginRequiredBanner();
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

// Listen for login state changes from injected script
window.addEventListener('message', (event) => {
  if (event.data?.type === 'threads-login-state') {
    const wasLoggedIn = state.isUserLoggedIn;
    state.isUserLoggedIn = event.data.isLoggedIn;

    console.log(`[Threads Extractor] Login state changed: ${state.isUserLoggedIn ? 'LOGGED IN' : 'LOGGED OUT'}`);

    // If user just logged out, clear any pending fetches
    if (wasLoggedIn === true && state.isUserLoggedIn === false) {
      fetchQueue.length = 0;
      state.isFetching = false;
    }
  }

  // Listen for new user ID discoveries from injected script and persist them
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

// Inject location badges into followers/following list
function injectLocationBadgesIntoFriendshipsList(users) {
  for (const user of users) {
    const { pk, username } = user;
    injectLocationUIForUser(username, pk, profileCache, followersVisibilityObserver);
  }
}

// Declare observers first (will be initialized after queue functions are defined)
let visibilityObserver;
let followersVisibilityObserver;

// Wrapper functions for queue management
function queueFeedFetch(username, btn) {
  queueFetch(username, btn, fetchQueue, visibilityObserver,
    () => processFetchQueue(fetchQueue, state, profileCache, FETCH_DELAY_MS),
    state.autoFetchReady, profileCache, MAX_QUEUE_SIZE);
}

function queueFollowersFetch(username, btn) {
  queueFetch(username, btn, followersFetchQueue, followersVisibilityObserver,
    () => processFollowersFetchQueue(followersFetchQueue, state, profileCache, FETCH_DELAY_MS),
    true, profileCache, MAX_QUEUE_SIZE);
}

// Initialize IntersectionObservers using factory functions
visibilityObserver = createFeedVisibilityObserver(
  queueFeedFetch, pendingVisibility, profileCache, state, VISIBILITY_DELAY_MS
);

followersVisibilityObserver = createFollowersVisibilityObserver(
  queueFollowersFetch, pendingFollowersVisibility, profileCache, state, VISIBILITY_DELAY_MS
);

// Detect if we're on an activity page (replies, follows, etc.)
function isActivityPage() {
  const path = window.location.pathname;
  return path === '/activity' || path.startsWith('/activity/');
}

// Add "Get Info" buttons after the time element on posts
function addFetchButtons() {
  // Find all time elements that haven't been processed
  const timeElements = document.querySelectorAll('time:not([data-threads-info-added])');

  const onActivityPage = isActivityPage();

  timeElements.forEach(async timeEl => {
    // Mark as processed
    timeEl.setAttribute('data-threads-info-added', 'true');

    // Skip if this element is inside a friendships dialog (followers/following tabs)
    // The friendshipsUI module handles those separately
    // Friendships dialogs have tabs with role="tab"
    const dialog = timeEl.closest('[role="dialog"]');
    if (dialog) {
      const hasTabs = dialog.querySelector('[role="tab"]') !== null;
      if (hasTabs) {
        // This is a friendships dialog - skip it
        return;
      }
    }

    // Find the post container
    const postContainer = findPostContainer(timeEl);
    if (!postContainer) return;

    // Skip if we already added a button to this post
    if (postContainer.querySelector('.threads-fetch-btn')) return;

    // On activity pages, only process single-user notifications (replies, mentions, quotes)
    // Skip likes, follows, and other aggregated notifications
    if (onActivityPage) {
      const iconElement = findIconElement(postContainer);
      if (!iconElement) return; // Skip if no icon detected

      const iconColor = extractIconColor(iconElement);
      if (!isSingleUserNotification(iconColor)) {
        return; // Skip aggregated notifications (likes, follows, etc.)
      }
    }

    // Find the username for this post
    // For reposts, there are TWO profile links: the reposter and the original poster
    // We need to find the link closest to the time element (the original poster)
    let { username } = findUsernameFromTimeElement(timeEl);
    if (!username) {
      // Fallback: use the first link in the container (old behavior)
      const fallbackLink = postContainer.querySelector('a[href^="/@"]');
      if (!fallbackLink) return;

      const href = fallbackLink.getAttribute('href');
      // Match username links (with optional query params/hash), but not post links
      const match = href.match(/^\/@([\w.]+)(?:[?#]|$)/);
      if (!match) return;

      username = match[1];
    }

    // Detect if this is a user-list context (activity modal, followers/following)
    // vs a post timeline context
    const isUserList = isUserListContext(postContainer);

    // Skip if we already have this profile cached and displayed
    const badgeClass = isUserList ? '.threads-friendships-location-badge' : '.threads-profile-info-badge';
    if (profileCache.has(username) && postContainer.querySelector(badgeClass)) return;

    // If we have cached data for this user, display badge directly without creating button
    if (profileCache.has(username)) {
      const profileInfo = profileCache.get(username);

      if (isUserList) {
        // User-list context: use friendships badge (pill style, positioned right)
        const badge = await createLocationBadge(profileInfo);

        // Find the Follow button container using structural detection
        const buttonContainer = findFollowButtonContainer(postContainer);

        if (buttonContainer && buttonContainer.parentElement) {
          // Insert badge before the button container (as a sibling)
          buttonContainer.parentElement.insertBefore(badge, buttonContainer);
        } else {
          // Fallback: append to container
          console.warn('[Threads Extractor] Could not find button container for badge insertion');
          postContainer.appendChild(badge);
        }
      } else {
        // Post context: use post badge (inline style)
        const timeParent = timeEl.closest('span') || timeEl.parentElement;
        const badge = await createProfileBadge(profileInfo);

        if (onActivityPage) {
          // On activity pages: append inline to timeParent to avoid breaking block layout
          if (timeParent) {
            timeParent.appendChild(badge);
          }
        } else {
          // On regular posts: insert as sibling (existing behavior)
          if (timeParent?.parentElement) {
            timeParent.parentElement.style.alignItems = 'center';
            timeParent.parentElement.insertBefore(badge, timeParent.nextSibling);
          }
        }
      }
      return;
    }

    // Create the fetch button for uncached users
    const btn = document.createElement('button');

    if (isUserList) {
      // User-list context: use friendships button style (pill style, positioned right)
      btn.className = 'threads-friendships-fetch-btn';
      btn.textContent = '📍';
      btn.title = `Get location for @${username}`;
      btn.setAttribute('data-username', username);

      // Find the Follow button container using structural detection
      const buttonContainer = findFollowButtonContainer(postContainer);

      if (buttonContainer && buttonContainer.parentElement) {
        // Insert button before the button container (as a sibling)
        buttonContainer.parentElement.insertBefore(btn, buttonContainer);
      } else {
        // Fallback: append to container
        console.warn('[Threads Extractor] Could not find button container for button insertion');
        postContainer.appendChild(btn);
      }
    } else {
      // Post context: use post button style (inline style)
      btn.className = 'threads-fetch-btn';
      btn.textContent = '📍';
      btn.title = `Get location for @${username}`;
      btn.setAttribute('data-username', username);

      // Insert button after the time element
      const timeParent = timeEl.closest('span') || timeEl.parentElement;
      if (timeParent) {
        if (onActivityPage) {
          // On activity pages: append inline to timeParent
          timeParent.appendChild(btn);
        } else {
          // On regular posts: insert as sibling
          if (timeParent.parentElement) {
            timeParent.parentElement.style.alignItems = 'center';
            timeParent.parentElement.insertBefore(btn, timeParent.nextSibling);
          }
        }
      }
    }

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Check if button is marked as login-required
      if (btn.getAttribute('data-login-required') === 'true') {
        console.log('[Threads Extractor] Login required button clicked - showing banner');
        showLoginRequiredBanner();
        return; // Don't attempt to fetch
      }

      btn.disabled = true;
      btn.textContent = '⏳';

      // Request user ID lookup using shared utility
      const userId = await getUserIdByUsername(username);

      if (userId) {
        // Request profile fetch using shared utility
        const result = await fetchProfileByUserId(userId);

        if (result) {
          if (result._loginRequired) {
            // Login required - show lock icon and banner
            btn.textContent = '🔒';
            btn.title = browserAPI.i18n.getMessage('loginRequired') || 'Login required. Click to learn more.';
            btn.disabled = false;
            btn.setAttribute('data-login-required', 'true');
            // Show banner when user manually clicks button
            showLoginRequiredBanner();
          } else {
            // Profile fetched successfully
            const profileInfo = profileCache.get(username);
            if (profileInfo && isUserList) {
              // For user-list context (activity modals), insert badge here
              // friendshipsUI handles its own buttons, but we handle activity modal buttons
              const badge = await createLocationBadge(profileInfo);
              btn.parentElement.insertBefore(badge, btn);
              btn.style.display = 'none';
            }
            // For post context, displayProfileInfo() handles it
          }
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

    // Auto-fetch: only observe post buttons, not friendships buttons
    // Friendships buttons (in user-list context) should be manual click only
    if (!isUserList) {
      visibilityObserver.observe(btn);
    }
  });
}

// Observe DOM for new posts AND for friendships dialog reopening/scrolling
function observeFeed() {
  const observer = new MutationObserver((_mutations) => {
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
                      injectLocationUIForUser(username, userData.pk, profileCache, followersVisibilityObserver);
                    } else {
                      // User not in our GraphQL list - try to get user ID from injected script
                      getUserIdByUsername(username, 100).then(userId => {
                        if (userId) {
                          injectLocationUIForUser(username, userId, profileCache, followersVisibilityObserver);
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
    state.autoFetchReady = true;
    console.log('[Threads Extractor] Auto-fetch enabled');
    processFetchQueue(fetchQueue, state, profileCache, FETCH_DELAY_MS); // Process any queued items
  }, INITIAL_DELAY_MS);
}

// Load auto-query settings from storage
browserAPI.storage.local.get(['autoQueryEnabled', 'autoQueryFollowersEnabled']).then((result) => {
  state.autoQueryEnabled = result.autoQueryEnabled !== false;
  state.autoQueryFollowersEnabled = result.autoQueryFollowersEnabled === true; // Default off
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
    state.autoQueryEnabled = message.enabled;
    console.log('[Threads Extractor] Auto-query', state.autoQueryEnabled ? 'enabled' : 'disabled');
    if (state.autoQueryEnabled) {
      processFetchQueue(fetchQueue, state, profileCache, FETCH_DELAY_MS);
    }
  } else if (message.type === 'AUTO_QUERY_FOLLOWERS_CHANGED') {
    state.autoQueryFollowersEnabled = message.enabled;
    console.log('[Threads Extractor] Auto-query followers', state.autoQueryFollowersEnabled ? 'enabled' : 'disabled');
  } else if (message.type === 'SHOW_FLAGS_CHANGED') {
    console.log('[Threads Extractor] Show flags', message.enabled ? 'enabled' : 'disabled');
    // Update all existing badges on the page
    updateBadgesForFlagsChange();
  } else if (message.type === 'CUSTOM_EMOJIS_CHANGED') {
    console.log('[Threads Extractor] Custom emojis changed, refreshing badges');
    // Update all existing badges to show new custom emojis
    updateBadgesForFlagsChange();
  }
});

// Wait for DOM to be ready
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', init);
} else {
init();
}
