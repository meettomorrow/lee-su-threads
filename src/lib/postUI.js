// Post UI functions for displaying profile info on Threads posts
import { isNewUser } from './dateParser.js';
import { formatLocation } from './locationMapper.js';

// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

/**
 * Display profile info badge for a user by finding and updating their fetch buttons
 * @param {Object} profileInfo - Profile information object
 * @param {Map} profileCache - Profile cache
 */
export async function displayProfileInfo(profileInfo, profileCache) {
  const username = profileInfo.username;

  // Find all fetch buttons for this user
  const postButtons = document.querySelectorAll(`.threads-fetch-btn[data-username="${username}"]`);

  // Handle post-style buttons
  for (const btn of postButtons) {
    // Check if we already added a badge next to this button
    if (btn.previousElementSibling?.classList?.contains('threads-profile-info-badge')) continue;

    // Create the info badge and insert before the button (so it appears to the left)
    const badge = await createProfileBadge(profileInfo);
    btn.parentElement?.insertBefore(badge, btn);

    // Hide button after success - badge shows the info
    btn.style.display = 'none';
  }

  // NOTE: We don't handle .threads-friendships-fetch-btn here because:
  // 1. Buttons in friendships dialog (followers/following tabs) are handled by friendshipsUI module
  // 2. Buttons in activity modals are handled by addFetchButtons() in content.js
  // This prevents duplicate badge insertion
}

/**
 * Create a profile info badge element with location and joined date
 * @param {Object} profileInfo - Profile information object
 * @returns {Promise<HTMLElement>} Badge element
 */
export async function createProfileBadge(profileInfo) {
  const badge = document.createElement('span');
  badge.className = 'threads-profile-info-badge';

  const joinedLabel = browserAPI.i18n.getMessage('joined') || 'Joined';
  const isNew = isNewUser(profileInfo.joined);
  const newLabel = browserAPI.i18n.getMessage('newUser') || 'NEW';

  // Get showFlags setting and custom emojis
  const { showFlags = true, customLocationEmojis = {} } = await browserAPI.storage.local.get(['showFlags', 'customLocationEmojis']);

  if (profileInfo.location) {
    // Get custom emoji for this location (if set)
    const customEmoji = customLocationEmojis[profileInfo.location] || null;

    const clickHint = browserAPI.i18n.getMessage('clickToCustomize') || 'Click to customize emoji';

    // Display location with optional flag emoji or custom emoji
    badge.textContent = formatLocation(profileInfo.location, false, showFlags, customEmoji);
    badge.title = `${profileInfo.location} • ${joinedLabel}: ${profileInfo.joined || 'Unknown'}\n(${clickHint})`;
    badge.style.cursor = 'pointer';

    // Click to customize emoji - opens settings with this location
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const settingsUrl = browserAPI.runtime.getURL('popup.html') + `?location=${encodeURIComponent(profileInfo.location)}`;
      browserAPI.runtime.sendMessage({
        type: 'OPEN_POPUP_IN_TAB',
        url: settingsUrl
      });
    });
  } else {
    // Location not available - show "無地點資料" with same hover behavior as regular location
    const noLocationData = browserAPI.i18n.getMessage('noLocationData') || 'No location data';
    badge.textContent = noLocationData;
    badge.title = `${joinedLabel}: ${profileInfo.joined || 'Unknown'}`;
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

/**
 * Auto-fetch profile info for a username
 * @param {string} username - Username to fetch
 * @param {HTMLElement} btn - Button element to update
 * @param {Map} profileCache - Profile cache
 */
export async function autoFetchProfile(username, btn, profileCache) {
  // Skip if already cached
  if (profileCache.has(username)) {
    const cached = profileCache.get(username);
    displayProfileInfo(cached, profileCache);
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
    } else if (result._loginRequired) {
      // Login required - show lock icon (banner will be shown on manual click)
      btn.textContent = '🔒';
      btn.title = browserAPI.i18n.getMessage('loginRequired') || 'Login required. Click to learn more.';
      btn.disabled = false;
      // Mark button as login-required so click handler knows to show banner
      btn.setAttribute('data-login-required', 'true');
    } else {
      btn.style.display = 'none';
    }
  } else {
    btn.textContent = '🔄';
    btn.title = 'Failed to load. Click to retry.';
    btn.disabled = false;
  }
}
