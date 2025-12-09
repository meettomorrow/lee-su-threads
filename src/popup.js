// Popup script for Threads Profile Extractor
import { isNewUser } from './lib/dateParser.js';

// Cross-browser compatibility: use browser.* API if available (Firefox), fallback to chrome.*
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', () => {
  const profileCountEl = document.getElementById('profileCount');
  const profileListEl = document.getElementById('profileList');
  const locationStatsListEl = document.getElementById('locationStatsList');
  const exportBtn = document.getElementById('exportBtn');
  const copyBtn = document.getElementById('copyBtn');
  const clearBtn = document.getElementById('clearBtn');
  const autoQueryToggle = document.getElementById('autoQueryToggle');
  const locationFilter = document.getElementById('locationFilter');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const profilesTab = document.getElementById('profilesTab');
  const locationsTab = document.getElementById('locationsTab');

  let profiles = {};
  let filterText = '';
  let filterNoLocation = false; // Special flag for filtering profiles without location
  let activeTab = 'profiles';

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
        browserAPI.tabs.sendMessage(tabs[0].id, { type: 'AUTO_QUERY_CHANGED', enabled });
      }
    });
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

      profileCountEl.textContent = count;

      renderProfileList();
    }).catch((err) => {
      console.error('Failed to load profiles:', err);
    });
  }

  // Render the profile list
  function renderProfileList() {
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
        profileMeta.appendChild(document.createTextNode(' • 📍 '));
        profileMeta.appendChild(document.createTextNode(data.location));
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
    const dataStr = JSON.stringify(profiles, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `threads-profiles-${new Date().toISOString().split('T')[0]}.json`;
    a.click();

    URL.revokeObjectURL(url);

    showToast(browserAPI.i18n.getMessage('exportSuccess') || 'Exported successfully!');
  });

  // Copy to clipboard
  copyBtn.addEventListener('click', async () => {
    const dataStr = JSON.stringify(profiles, null, 2);

    try {
      await navigator.clipboard.writeText(dataStr);
      showToast(browserAPI.i18n.getMessage('copySuccess') || 'Copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
      showToast(browserAPI.i18n.getMessage('copyFailed') || 'Failed to copy', true);
    }
  });

  // Clear cache
  clearBtn.addEventListener('click', () => {
    if (confirm(browserAPI.i18n.getMessage('confirmClear') || 'Are you sure you want to clear all cached profiles?')) {
      // Show loading state
      const originalText = clearBtn.textContent;
      clearBtn.textContent = '⏳ ' + (browserAPI.i18n.getMessage('clearing') || 'Clearing...');
      clearBtn.disabled = true;

      // Clear both profile cache and user ID cache
      browserAPI.storage.local.set({ profileCache: {}, userIdCache: {} }).then(() => {
        // Reload profiles from storage (now empty)
        loadProfiles();

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
  });

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

  // Render location stats
  function renderLocationStats() {
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

    sortedLocations.forEach(([location, count]) => {
      const percentage = (count / maxCount) * 100;

      const item = document.createElement('div');
      item.className = 'location-stat-item';
      item.setAttribute('data-location', location);

      const locationInfo = document.createElement('div');
      locationInfo.className = 'location-info';

      const locationContent = document.createElement('div');
      locationContent.className = 'location-content';

      const locationName = document.createElement('div');
      locationName.className = 'location-name';
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

      const countSpan = document.createElement('span');
      countSpan.className = 'location-count';
      countSpan.textContent = count;

      item.appendChild(locationInfo);
      item.appendChild(countSpan);

      // Add click handler
      item.addEventListener('click', () => {
        filterNoLocation = false;
        filterText = location;
        locationFilter.value = location;
        activeTab = 'profiles';
        tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === 'profiles'));
        profilesTab.classList.add('active');
        locationsTab.classList.remove('active');
        renderProfileList();
      });

      locationStatsListEl.appendChild(item);
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

  // Listen for updates from content script
  browserAPI.runtime.onMessage.addListener((message) => {
    if (message.type === 'PROFILE_INFO_EXTRACTED') {
      loadProfiles();
    }
  });
});
