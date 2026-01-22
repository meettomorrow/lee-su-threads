// Popup script for Threads Profile Extractor
import { isNewUser } from './lib/dateParser.js';
import { formatLocation } from './lib/locationMapper.js';
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';
import 'emoji-picker-element';

// Cross-browser compatibility: use browser.* API if available (Firefox), fallback to chrome.*
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Initialize country flag emoji polyfill for Windows compatibility (popup context)
// Use local font to avoid CSP issues with CDN
polyfillCountryFlagEmojis("Twemoji Country Flags", browserAPI.runtime.getURL('fonts/TwemojiCountryFlags.woff2'));

// Theme detection and application
function detectAndApplyTheme() {
  // First, try to get Threads theme from storage (set by content script)
  browserAPI.storage.local.get(['threadsTheme']).then((result) => {
    let theme = result.threadsTheme;

    // If no Threads theme detected, fall back to system preference
    if (!theme) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    // Apply theme to document
    document.documentElement.setAttribute('data-theme', theme);
  });
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  // Only react to system changes if no Threads theme is set
  browserAPI.storage.local.get(['threadsTheme']).then((result) => {
    if (!result.threadsTheme) {
      const theme = e.matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
    }
  });
});

// Apply theme on load
detectAndApplyTheme();

// Display version number
const versionNumberEl = document.getElementById('versionNumber');
if (versionNumberEl) {
  const version = browserAPI.runtime.getManifest().version;
  versionNumberEl.textContent = `v${version}`;
}

document.addEventListener('DOMContentLoaded', () => {
  // Get DOM elements
  const profileCountEl = document.getElementById('profileCount');
  const headerProfileCountEl = document.getElementById('headerProfileCount');
  const profileListEl = document.getElementById('profileList');
  const locationStatsListEl = document.getElementById('locationStatsList');
  const exportBtn = document.getElementById('exportBtn');
  const copyBtn = document.getElementById('copyBtn');
  const clearBtn = document.getElementById('clearBtn');
  const autoQueryToggle = document.getElementById('autoQueryToggle');
  const autoQueryFollowersToggle = document.getElementById('autoQueryFollowersToggle');
  const showFlagsToggle = document.getElementById('showFlagsToggle');
  const locationFilter = document.getElementById('locationFilter');
  const onboardingLink = document.getElementById('onboardingLink');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const profilesTab = document.getElementById('profilesTab');
  const locationsTab = document.getElementById('locationsTab');
  const contentEl = document.querySelector('.content');

  // Variables used throughout
  let profiles = {};
  let filterText = '';
  let filterNoLocation = false; // Special flag for filtering profiles without location
  let activeTab = 'profiles';
  let rateLimitCountdownInterval = null;

  // Rate limit handling functions
  function showRateLimitBanner(rateLimitedUntil) {
    const banner = document.getElementById('rateLimitBanner');
    const countdown = document.getElementById('rateLimitCountdown');

    if (!banner || !countdown) return;

    banner.classList.add('visible');

    // Clear any existing interval
    if (rateLimitCountdownInterval) {
      clearInterval(rateLimitCountdownInterval);
    }

    // Update countdown every second
    const updateCountdown = () => {
      const now = Date.now();
      const remaining = rateLimitedUntil - now;

      if (remaining <= 0) {
        hideRateLimitBanner();
        enableAllToggles();
        return;
      }

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      if (minutes > 0) {
        countdown.textContent = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
      } else {
        countdown.textContent = `${seconds} second${seconds !== 1 ? 's' : ''}`;
      }
    };

    updateCountdown();
    rateLimitCountdownInterval = setInterval(updateCountdown, 1000);
  }

  function hideRateLimitBanner() {
    const banner = document.getElementById('rateLimitBanner');
    if (banner) {
      banner.classList.remove('visible');
    }

    if (rateLimitCountdownInterval) {
      clearInterval(rateLimitCountdownInterval);
      rateLimitCountdownInterval = null;
    }
  }

  function disableAllToggles() {
    autoQueryToggle.disabled = true;
    autoQueryFollowersToggle.disabled = true;
    showFlagsToggle.disabled = true;
  }

  function enableAllToggles() {
    autoQueryToggle.disabled = false;
    autoQueryFollowersToggle.disabled = false;
    showFlagsToggle.disabled = false;
  }

  // Detect if we should use sheet modal for emoji picker
  // Use sheet modal for:
  // 1. Browser extension popup (360×500px)
  // 2. Mobile devices (screen width <= 600px)
  const shouldUseSheetModal = () => {
    // Check if it's a mobile device (includes tablets in portrait)
    const isMobileDevice = window.innerWidth <= 600;
    // Check if it's the browser extension popup
    const isExtensionPopup = window.innerWidth <= 599 && window.innerHeight <= 600;
    return isMobileDevice || isExtensionPopup;
  };

  // Detect if running on a mobile device (for auto-open picker logic)
  // Use userAgent since popup window size is small even on desktop
  const isMobileDevice = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Check URL parameters for location pre-selection
  const urlParams = new URLSearchParams(window.location.search);
  const preSelectLocation = urlParams.get('location');

  // Get emoji picker sheet modal elements early for use in scroll handler
  const emojiPickerSheet = document.getElementById('emojiPickerSheet');
  const emojiPickerSheetClose = document.getElementById('emojiPickerSheetClose');

  // Scroll detection for hiding stats in mobile view and sticky tabs shadow
  const tabsEl = document.querySelector('.tabs');
  const statsEl = document.querySelector('.stats');
  const scrollToTopBtn = document.getElementById('scrollToTop');
  let scrollRAF = null;

  if (contentEl) {
    contentEl.addEventListener('scroll', () => {
      if (scrollRAF) return;

      scrollRAF = requestAnimationFrame(() => {
        const scrollTop = contentEl.scrollTop;

        // Hide stats in mobile view when scrolled
        if (scrollTop > 20) {
          document.body.classList.add('scrolled');
        } else {
          document.body.classList.remove('scrolled');
        }

        // Add shadow to tabs when sticky (scrolled past stats)
        if (tabsEl && statsEl) {
          const statsHeight = statsEl.offsetHeight;
          if (scrollTop > statsHeight) {
            tabsEl.classList.add('is-sticky');
          } else {
            tabsEl.classList.remove('is-sticky');
          }
        }

        // Show/hide scroll-to-top button
        if (scrollToTopBtn) {
          if (scrollTop > 200) {
            scrollToTopBtn.classList.add('visible');
          } else {
            scrollToTopBtn.classList.remove('visible');
          }
        }

        // Close emoji picker when scrolling (if locations tab is active)
        if (activeTab === 'locations') {
          const emojiPicker = document.querySelector('emoji-picker:not(.hidden)');
          if (emojiPicker) {
            emojiPicker.classList.add('hidden');
            // Remove dimming when picker closes
            document.querySelectorAll('.location-stat-item').forEach(item => {
              item.classList.remove('dimmed');
            });
          }
          // Also close sheet modal if open (use module-level variable)
          if (emojiPickerSheet && emojiPickerSheet.classList.contains('visible')) {
            emojiPickerSheet.classList.remove('visible');
          }
        }

        scrollRAF = null;
      });
    });
  }

  // Scroll-to-top button click handler
  if (scrollToTopBtn && contentEl) {
    scrollToTopBtn.addEventListener('click', () => {
      contentEl.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  // Tab switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      activeTab = tab;

      // Update button states
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update tab content visibility
      profilesTab.classList.toggle('active', tab === 'profiles');
      locationsTab.classList.toggle('active', tab === 'locations');

      // Render the appropriate content
      if (tab === 'locations') {
        renderLocationStats();
      }
    });
  });

  // Load and handle auto-query setting
  browserAPI.storage.local.get(['autoQueryEnabled']).then((result) => {
    // Default to true if not set
    const enabled = result.autoQueryEnabled !== false;
    autoQueryToggle.checked = enabled;
  });

  autoQueryToggle.addEventListener('change', () => {
    const enabled = autoQueryToggle.checked;
    browserAPI.storage.local.set({ autoQueryEnabled: enabled });
    // Notify content script
    browserAPI.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]?.id) {
        browserAPI.tabs.sendMessage(tabs[0].id, { type: 'AUTO_QUERY_CHANGED', enabled }).catch(() => {
          // Content script not loaded yet - that's ok
        });
      }
    });
  });

  // Load initial settings
  browserAPI.storage.local.get([
    'autoQueryEnabled',
    'autoQueryFollowersEnabled',
    'showFlags',
    'rateLimitedUntil'
  ]).then((result) => {
    // Check if currently rate limited
    const rateLimitedUntil = result.rateLimitedUntil || 0;
    if (Date.now() < rateLimitedUntil) {
      disableAllToggles();
      showRateLimitBanner(rateLimitedUntil);
      return;
    }

    // Set toggles based on stored settings
    autoQueryToggle.checked = result.autoQueryEnabled !== false;
    autoQueryFollowersToggle.checked = result.autoQueryFollowersEnabled === true;
    showFlagsToggle.checked = result.showFlags !== false;
  });

  // Additional toggle change event listeners
  autoQueryFollowersToggle.addEventListener('change', () => {
    const enabled = autoQueryFollowersToggle.checked;
    browserAPI.storage.local.set({ autoQueryFollowersEnabled: enabled });
    browserAPI.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]?.id) {
        browserAPI.tabs.sendMessage(tabs[0].id, { type: 'AUTO_QUERY_FOLLOWERS_CHANGED', enabled }).catch(() => {
          // Content script not loaded yet - that's ok
        });
      }
    });
  });

  showFlagsToggle.addEventListener('change', () => {
    const enabled = showFlagsToggle.checked;
    browserAPI.storage.local.set({ showFlags: enabled });
    browserAPI.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]?.id) {
        browserAPI.tabs.sendMessage(tabs[0].id, { type: 'SHOW_FLAGS_CHANGED', enabled }).catch(() => {
          // Content script not loaded yet - that's ok
        });
      }
    });
  });


  // Listen for rate limit events from content script
  browserAPI.runtime.onMessage.addListener((message) => {
    if (message.type === 'RATE_LIMITED') {
      disableAllToggles();
      // Get the rate limit end time from storage
      browserAPI.storage.local.get(['rateLimitedUntil']).then((result) => {
        const rateLimitedUntil = result.rateLimitedUntil || 0;
        if (Date.now() < rateLimitedUntil) {
          showRateLimitBanner(rateLimitedUntil);
        }
      });
    } else if (message.type === 'RATE_LIMIT_CLEARED') {
      enableAllToggles();
      hideRateLimitBanner();
    }
  });

  // Localize UI elements
  function localizeUI() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const msg = browserAPI.i18n.getMessage(el.dataset.i18n);
      if (msg) {
        el.textContent = msg;
      }
    });
    // Localize title attributes
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const msg = browserAPI.i18n.getMessage(el.dataset.i18nTitle);
      if (msg) {
        el.title = msg;
      }
    });
  }
  localizeUI();

  // Localize filter placeholder
  const filterPlaceholder = browserAPI.i18n.getMessage('filterPlaceholder') || 'Filter by location...';
  locationFilter.placeholder = filterPlaceholder;

  // Handle location filter
  locationFilter.addEventListener('input', (e) => {
    filterText = e.target.value;
    filterNoLocation = false; // Clear no-location filter when typing
    renderProfileList();
  });

  // Load cached profiles
  function loadProfiles() {
    browserAPI.storage.local.get(['profileCache']).then((result) => {
      profiles = result.profileCache || {};
      const count = Object.keys(profiles).length;

      // Update both profile count displays
      if (profileCountEl) profileCountEl.textContent = count;
      if (headerProfileCountEl) headerProfileCountEl.textContent = count;

      renderProfileList();
    }).catch((err) => {
      console.error('Failed to load profiles:', err);
    });
  }

  // Render the profile list
  async function renderProfileList() {
    // Get showFlags setting and custom emojis
    const { showFlags = true, customLocationEmojis = {} } = await browserAPI.storage.local.get(['showFlags', 'customLocationEmojis']);

    let entries = Object.entries(profiles);

    // Apply location filter
    if (filterNoLocation) {
      // Filter to show only profiles without location
      entries = entries.filter(([, data]) => !data.location);
    } else if (filterText) {
      const lowerFilter = filterText.toLowerCase();
      entries = entries.filter(([, data]) =>
        data.location && data.location.toLowerCase().includes(lowerFilter)
      );
    }

    if (entries.length === 0) {
      const emptyMsg = filterText
        ? (browserAPI.i18n.getMessage('noLocation') || 'No location')
        : (browserAPI.i18n.getMessage('emptyState') || 'No profiles extracted yet.\nBrowse Threads to capture profile info.');

      profileListEl.textContent = '';
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';

      const icon = document.createElement('div');
      icon.className = 'empty-state-icon';
      icon.textContent = '🔍';

      const text = document.createElement('div');
      text.className = 'empty-state-text';
      const msgLines = emptyMsg.split('\n');
      msgLines.forEach((line, index) => {
        if (index > 0) text.appendChild(document.createElement('br'));
        text.appendChild(document.createTextNode(line));
      });

      emptyState.appendChild(icon);
      emptyState.appendChild(text);
      profileListEl.appendChild(emptyState);
      return;
    }

    // Sort by timestamp (most recent first)
    entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));

    const newLabel = browserAPI.i18n.getMessage('newUser') || 'NEW';

    profileListEl.textContent = '';

    entries.forEach(([username, data]) => {
      const isNew = isNewUser(data.joined);

      const profileItem = document.createElement('div');
      profileItem.className = 'profile-item';
      profileItem.setAttribute('data-username', username);

      // Avatar
      if (data.profileImage) {
        const img = document.createElement('img');
        img.src = data.profileImage;
        img.className = 'profile-avatar';
        img.alt = username;
        profileItem.appendChild(img);
      } else {
        const avatarPlaceholder = document.createElement('div');
        avatarPlaceholder.className = 'profile-avatar';
        profileItem.appendChild(avatarPlaceholder);
      }

      // Profile info
      const profileInfo = document.createElement('div');
      profileInfo.className = 'profile-info';

      // Profile name
      const profileName = document.createElement('div');
      profileName.className = 'profile-name';
      profileName.textContent = data.displayName || username;

      if (isNew) {
        const newTag = document.createElement('span');
        newTag.className = 'new-user-tag';
        newTag.textContent = `[${newLabel}]`;
        profileName.appendChild(newTag);
      }

      // Profile meta
      const profileMeta = document.createElement('div');
      profileMeta.className = 'profile-meta';
      profileMeta.textContent = `@${username}`;

      if (data.location) {
        profileMeta.appendChild(document.createTextNode(' • '));
        // Get custom emoji for this location (if set)
        const customEmoji = customLocationEmojis[data.location] || null;
        // Display location with flag emoji or custom emoji
        const displayText = formatLocation(data.location, false, showFlags, customEmoji);
        profileMeta.appendChild(document.createTextNode(displayText));
      }

      profileInfo.appendChild(profileName);
      profileInfo.appendChild(profileMeta);
      profileItem.appendChild(profileInfo);

      // Add click handler
      profileItem.addEventListener('click', () => {
        browserAPI.tabs.create({ url: `https://www.threads.com/@${username}` });
      });

      profileListEl.appendChild(profileItem);
    });
  }

  // Export profiles as JSON
  exportBtn.addEventListener('click', () => {
    const profileCount = Object.keys(profiles).length;

    if (profileCount === 0) {
      showToast(browserAPI.i18n.getMessage('noDataToExport') || 'No profiles to export', true);
      return;
    }

    const dataStr = JSON.stringify(profiles, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `threads-profiles-${new Date().toISOString().split('T')[0]}.json`;

    // Safari workaround: append to body, click, then remove
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Delay cleanup to ensure download starts
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);

    showToast(browserAPI.i18n.getMessage('exportSuccess') || 'Exported successfully!');
  });

  // Copy to clipboard
  copyBtn.addEventListener('click', async () => {
    const profileCount = Object.keys(profiles).length;

    if (profileCount === 0) {
      showToast(browserAPI.i18n.getMessage('noDataToCopy') || 'No profiles to copy', true);
      return;
    }

    const dataStr = JSON.stringify(profiles, null, 2);

    try {
      await navigator.clipboard.writeText(dataStr);
      showToast(browserAPI.i18n.getMessage('copySuccess') || 'Copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
      showToast(browserAPI.i18n.getMessage('copyFailed') || 'Failed to copy', true);
    }
  });

  // Show custom confirmation dialog
  function showConfirmDialog(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.2s ease;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: var(--bg-gradient-start);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 20px;
      max-width: 280px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      animation: slideUp 0.3s ease;
    `;

    const messageEl = document.createElement('div');
    messageEl.style.cssText = `
      color: var(--text-primary);
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 16px;
      text-align: center;
    `;
    messageEl.textContent = message;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 8px;
      justify-content: center;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = browserAPI.i18n.getMessage('cancel') || 'Cancel';
    cancelBtn.style.cssText = `
      flex: 1;
      padding: 8px 16px;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: var(--bg-overlay-5);
      color: var(--text-primary);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    `;
    cancelBtn.onmouseover = () => cancelBtn.style.background = 'var(--bg-overlay-10)';
    cancelBtn.onmouseout = () => cancelBtn.style.background = 'var(--bg-overlay-5)';

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = browserAPI.i18n.getMessage('confirm') || 'Clear';
    confirmBtn.style.cssText = `
      flex: 1;
      padding: 8px 16px;
      border: none;
      border-radius: 8px;
      background: #ef4444;
      color: white;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    `;
    confirmBtn.onmouseover = () => confirmBtn.style.background = '#dc2626';
    confirmBtn.onmouseout = () => confirmBtn.style.background = '#ef4444';

    const closeDialog = () => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 200);
    };

    cancelBtn.onclick = closeDialog;
    confirmBtn.onclick = () => {
      closeDialog();
      onConfirm();
    };
    overlay.onclick = (e) => {
      if (e.target === overlay) closeDialog();
    };

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(confirmBtn);
    dialog.appendChild(messageEl);
    dialog.appendChild(buttonContainer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Focus confirm button
    setTimeout(() => confirmBtn.focus(), 100);
  }

  // Clear cache
  clearBtn.addEventListener('click', () => {
    showConfirmDialog(
      browserAPI.i18n.getMessage('confirmClear') || 'Are you sure you want to clear all cached profiles?',
      () => {
        // Show loading state
        const originalText = clearBtn.textContent;
        clearBtn.textContent = '⏳ ' + (browserAPI.i18n.getMessage('clearing') || 'Clearing...');
        clearBtn.disabled = true;

        // Clear both profile cache and user ID cache
        browserAPI.storage.local.set({ profileCache: {}, userIdCache: {} }).then(() => {
          // Reload profiles from storage (now empty)
          loadProfiles();

          // If location stats tab is active, refresh it too
          if (activeTab === 'locations') {
            renderLocationStats();
          }

          // Reset button state
          clearBtn.textContent = originalText;
          clearBtn.disabled = false;

          showToast(browserAPI.i18n.getMessage('cacheCleared') || '✓ Cache cleared successfully!');
        }).catch((err) => {
          console.error('Failed to clear cache:', err);

          // Reset button state
          clearBtn.textContent = originalText;
          clearBtn.disabled = false;

          showToast(browserAPI.i18n.getMessage('clearFailed') || 'Failed to clear cache', true);
        });
      }
    );
  });

  // Onboarding link
  if (onboardingLink) {
    onboardingLink.addEventListener('click', (e) => {
      e.preventDefault();
      const onboardingUrl = browserAPI.runtime.getURL('onboarding.html');
      browserAPI.tabs.create({ url: onboardingUrl });
    });
  }

  // Show toast notification
  function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 10px 20px;
      background: ${isError ? '#ef4444' : '#10b981'};
      color: white;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger fade in
    setTimeout(() => {
      toast.style.opacity = '1';
    }, 10);

    // Fade out and remove
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // Save custom emoji for a location
  async function saveCustomEmoji(location, emoji) {
    const { customLocationEmojis = {} } = await browserAPI.storage.local.get(['customLocationEmojis']);

    if (emoji && emoji.trim()) {
      customLocationEmojis[location] = emoji.trim();
    } else {
      delete customLocationEmojis[location];
    }

    await browserAPI.storage.local.set({ customLocationEmojis });

    // Notify content script to refresh UI in all Threads tabs
    browserAPI.tabs.query({ url: 'https://www.threads.com/*' }).then((tabs) => {
      tabs.forEach((tab) => {
        browserAPI.tabs.sendMessage(tab.id, { type: 'CUSTOM_EMOJIS_CHANGED' }).catch(() => {
          // Ignore errors if tab doesn't have content script loaded
        });
      });
    });

    // Refresh popup display
    renderProfileList();
  }

  // Set up emoji picker sheet modal event listeners (once, outside of renderLocationStats)
  // (emojiPickerSheet and emojiPickerSheetClose are already declared at module level above)
  if (emojiPickerSheet && emojiPickerSheetClose) {
    // Sheet modal close button handler
    emojiPickerSheetClose.addEventListener('click', () => {
      emojiPickerSheet.classList.remove('visible');
    });

    // Sheet modal backdrop click handler (close when clicking outside)
    emojiPickerSheet.addEventListener('click', (e) => {
      if (e.target === emojiPickerSheet) {
        emojiPickerSheet.classList.remove('visible');
      }
    });

    // Close sheet modal on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && emojiPickerSheet.classList.contains('visible')) {
        emojiPickerSheet.classList.remove('visible');
      }
    });

    // Close picker on window resize (important for mobile/desktop transitions)
    window.addEventListener('resize', () => {
      // Close any open inline emoji pickers
      const openPicker = document.querySelector('emoji-picker:not(.hidden)');
      if (openPicker) {
        openPicker.classList.add('hidden');
        // Remove dimming
        document.querySelectorAll('.location-stat-item').forEach(item => {
          item.classList.remove('dimmed');
        });
      }
      // Also close sheet modal
      if (emojiPickerSheet.classList.contains('visible')) {
        emojiPickerSheet.classList.remove('visible');
      }
    });
  }

  // Render location stats
  async function renderLocationStats() {
    // Get custom emojis
    const { customLocationEmojis = {} } = await browserAPI.storage.local.get(['customLocationEmojis']);

    const entries = Object.entries(profiles);

    // Aggregate by location
    const locationCounts = {};
    let noLocationCount = 0;

    entries.forEach(([, data]) => {
      if (data.location) {
        const loc = data.location.trim();
        locationCounts[loc] = (locationCounts[loc] || 0) + 1;
      } else {
        noLocationCount++;
      }
    });

    const sortedLocations = Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1]);

    if (sortedLocations.length === 0) {
      const emptyMsg = browserAPI.i18n.getMessage('noLocationStats') || 'No location data yet.\nBrowse Threads to capture profile locations.';

      locationStatsListEl.textContent = '';
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';

      const icon = document.createElement('div');
      icon.className = 'empty-state-icon';
      icon.textContent = '📍';

      const text = document.createElement('div');
      text.className = 'empty-state-text';
      const msgLines = emptyMsg.split('\n');
      msgLines.forEach((line, index) => {
        if (index > 0) text.appendChild(document.createElement('br'));
        text.appendChild(document.createTextNode(line));
      });

      emptyState.appendChild(icon);
      emptyState.appendChild(text);
      locationStatsListEl.appendChild(emptyState);
      return;
    }

    const maxCount = sortedLocations[0][1];

    locationStatsListEl.textContent = '';

    // Get sheet modal elements (already defined at module level, just get the dynamic ones)
    const emojiPickerSheetTitle = document.getElementById('emojiPickerSheetTitle');
    const emojiPickerSheetContent = document.getElementById('emojiPickerSheetContent');

    // Create a single shared emoji picker (reused for all locations)
    let sharedPicker = null;
    let currentPickerButton = null;
    let currentPickerLocation = null;
    let currentResetButton = null;

    const createSharedPicker = () => {
      if (sharedPicker) return sharedPicker;

      sharedPicker = document.createElement('emoji-picker');
      sharedPicker.className = 'emoji-picker-popup hidden';

      // Close picker on Escape key
      sharedPicker.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          sharedPicker.classList.add('hidden');
        }
      });

      // Emoji picker selection
      sharedPicker.addEventListener('emoji-click', (e) => {
        e.stopPropagation();
        const selectedEmoji = e.detail.unicode;

        // Close sheet modal if using sheet modal, otherwise hide picker
        if (shouldUseSheetModal()) {
          emojiPickerSheet.classList.remove('visible');
        } else {
          sharedPicker.classList.add('hidden');
          // Remove dimming when picker closes
          document.querySelectorAll('.location-stat-item').forEach(item => {
            item.classList.remove('dimmed');
          });
        }

        if (currentPickerButton && currentPickerLocation) {
          // Update button to show selected emoji
          currentPickerButton.textContent = selectedEmoji;

          // Show reset button
          if (currentResetButton) {
            currentResetButton.classList.remove('hidden');
          }

          // Save the emoji
          saveCustomEmoji(currentPickerLocation, selectedEmoji);
        }
      });

      return sharedPicker;
    };

    sortedLocations.forEach(([location, count]) => {
      const percentage = (count / maxCount) * 100;
      const customEmoji = customLocationEmojis[location] || '';

      const item = document.createElement('div');
      item.className = 'location-stat-item';
      item.setAttribute('data-location', location);

      const locationInfo = document.createElement('div');
      locationInfo.className = 'location-info location-stat-item-clickable';

      const locationContent = document.createElement('div');
      locationContent.className = 'location-content';

      const locationName = document.createElement('div');
      locationName.className = 'location-name';
      // Display location text only (no emoji) - the emoji is shown in the edit button
      locationName.textContent = location;

      const locationBar = document.createElement('div');
      locationBar.className = 'location-bar';

      const locationBarFill = document.createElement('div');
      locationBarFill.className = 'location-bar-fill';
      locationBarFill.style.width = `${percentage}%`;

      locationBar.appendChild(locationBarFill);
      locationContent.appendChild(locationName);
      locationContent.appendChild(locationBar);
      locationInfo.appendChild(locationContent);

      // Add click handler to locationInfo only (not the whole item)
      locationInfo.addEventListener('click', () => {
        filterNoLocation = false;
        filterText = location;
        locationFilter.value = location;
        tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === 'profiles'));
        profilesTab.classList.add('active');
        locationsTab.classList.remove('active');
        renderProfileList();
      });

      // Emoji customizer
      const emojiCustomizer = document.createElement('div');
      emojiCustomizer.className = 'emoji-customizer';

      // Emoji picker button (shows as smiley when no custom emoji, otherwise shows custom emoji)
      const emojiPickerBtn = document.createElement('button');
      emojiPickerBtn.className = 'emoji-picker-btn';
      emojiPickerBtn.textContent = customEmoji || '🙂';
      emojiPickerBtn.setAttribute('aria-label', 'Pick emoji');
      emojiPickerBtn.title = browserAPI.i18n.getMessage('customEmojiHint') || 'Click to pick emoji';

      // Reset button (only show when there's a custom emoji)
      const resetBtn = document.createElement('button');
      resetBtn.className = 'btn-reset-emoji' + (customEmoji ? '' : ' hidden');
      resetBtn.textContent = '×';
      resetBtn.setAttribute('aria-label', `Reset emoji for ${location}`);
      resetBtn.title = browserAPI.i18n.getMessage('resetEmoji') || 'Reset to default flag';

      // Emoji picker button click - show shared picker
      emojiPickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        // Create shared picker if it doesn't exist
        const picker = createSharedPicker();

        // Update current context
        currentPickerButton = emojiPickerBtn;
        currentPickerLocation = location;
        currentResetButton = resetBtn;

        // Check if we should use sheet modal
        if (shouldUseSheetModal()) {
          // Use sheet modal in popup mode
          // Update sheet title with location name
          emojiPickerSheetTitle.textContent = `${browserAPI.i18n.getMessage('pickEmojiFor') || 'Pick emoji for'} ${location}`;

          // Move picker to sheet content if not already there
          if (picker.parentElement !== emojiPickerSheetContent) {
            emojiPickerSheetContent.appendChild(picker);
          }

          // Always ensure picker is visible when opening sheet
          picker.classList.remove('hidden');

          // Show sheet modal
          emojiPickerSheet.classList.add('visible');
        } else {
          // Use inline picker in tab mode
          // Position picker relative to this item
          if (picker.parentElement !== item) {
            // Remove from previous parent
            if (picker.parentElement) {
              picker.parentElement.removeChild(picker);
            }
            // Set item to relative positioning
            item.style.position = 'relative';
            // Append to current item
            item.appendChild(picker);
          }

          const isOpening = picker.classList.contains('hidden');
          picker.classList.toggle('hidden');

          // Dim other location items when opening picker
          if (isOpening) {
            // Dim all other items
            document.querySelectorAll('.location-stat-item').forEach(otherItem => {
              if (otherItem !== item) {
                otherItem.classList.add('dimmed');
              }
            });
          } else {
            // Remove dimming when closing
            document.querySelectorAll('.location-stat-item').forEach(otherItem => {
              otherItem.classList.remove('dimmed');
            });
          }

          // Add click-outside handler when opening
          if (isOpening) {
            setTimeout(() => {
              const closeHandler = (event) => {
                if (!picker.contains(event.target) && event.target !== emojiPickerBtn) {
                  picker.classList.add('hidden');
                  // Remove dimming
                  document.querySelectorAll('.location-stat-item').forEach(otherItem => {
                    otherItem.classList.remove('dimmed');
                  });
                  document.removeEventListener('click', closeHandler);
                }
              };
              document.addEventListener('click', closeHandler);
            }, 0);
          }
        }
      });

      // Reset button click
      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveCustomEmoji(location, '');
        emojiPickerBtn.textContent = '🙂';
        resetBtn.classList.add('hidden');
      });

      emojiCustomizer.appendChild(emojiPickerBtn);
      emojiCustomizer.appendChild(resetBtn);

      const countSpan = document.createElement('span');
      countSpan.className = 'location-count';
      countSpan.textContent = count;

      item.appendChild(locationInfo);
      item.appendChild(emojiCustomizer);
      item.appendChild(countSpan);

      locationStatsListEl.appendChild(item);

      // Auto-trigger picker if this location was pre-selected via URL
      if (preSelectLocation && location === preSelectLocation) {
        // Switch to locations tab and scroll to item
        setTimeout(() => {
          // Scroll to this item
          item.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // Only auto-open picker on desktop (not mobile)
          // On mobile devices, the picker is too large and blocks the view
          if (!isMobileDevice()) {
            // Trigger the button click to show picker on desktop
            emojiPickerBtn.click();
          }
        }, 100);
      }
    });

    // Add "No location" entry if there are profiles without location
    if (noLocationCount > 0) {
      const noLocLabel = browserAPI.i18n.getMessage('noLocation') || 'No location';

      const item = document.createElement('div');
      item.className = 'location-stat-item';
      item.setAttribute('data-location', '');
      item.style.opacity = '0.6';

      const locationInfo = document.createElement('div');
      locationInfo.className = 'location-info';

      const locationContent = document.createElement('div');
      locationContent.className = 'location-content';

      const locationName = document.createElement('div');
      locationName.className = 'location-name';
      locationName.textContent = noLocLabel;

      locationContent.appendChild(locationName);
      locationInfo.appendChild(locationContent);

      const countSpan = document.createElement('span');
      countSpan.className = 'location-count';
      countSpan.textContent = noLocationCount;

      item.appendChild(locationInfo);
      item.appendChild(countSpan);

      // Add click handler for "No location"
      item.addEventListener('click', () => {
        filterNoLocation = true;
        filterText = '';
        locationFilter.value = '';
        activeTab = 'profiles';
        tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === 'profiles'));
        profilesTab.classList.add('active');
        locationsTab.classList.remove('active');
        renderProfileList();
      });

      locationStatsListEl.appendChild(item);
    }
  }

  // Initial load
  loadProfiles();

  // If a location is pre-selected, switch to locations tab
  if (preSelectLocation) {
    // Switch to locations tab
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === 'locations'));
    profilesTab.classList.remove('active');
    locationsTab.classList.add('active');
    // Render location stats to trigger the auto-focus
    renderLocationStats();
  }

  // Listen for updates from content script
  browserAPI.runtime.onMessage.addListener((message) => {
    if (message.type === 'PROFILE_INFO_EXTRACTED') {
      loadProfiles();
    }
  });
});
