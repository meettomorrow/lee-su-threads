// Popup script for Threads Profile Extractor

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
      profileListEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${filterText ? '🔍' : '🔍'}</div>
          <div class="empty-state-text">
            ${emptyMsg.replace(/\n/g, '<br>')}
          </div>
        </div>
      `;
      return;
    }

    // Sort by timestamp (most recent first)
    entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));

    profileListEl.innerHTML = entries.map(([username, data]) => `
      <div class="profile-item" data-username="${escapeHtml(username)}">
        ${data.profileImage
          ? `<img src="${escapeHtml(data.profileImage)}" class="profile-avatar" alt="${escapeHtml(username)}" />`
          : `<div class="profile-avatar"></div>`
        }
        <div class="profile-info">
          <div class="profile-name">${escapeHtml(data.displayName || username)}</div>
          <div class="profile-meta">
            @${escapeHtml(username)}
            ${data.location ? ` • 📍 ${escapeHtml(data.location)}` : ''}
          </div>
        </div>
      </div>
    `).join('');

    // Add click handlers
    profileListEl.querySelectorAll('.profile-item').forEach(item => {
      item.addEventListener('click', () => {
        const username = item.dataset.username;
        browserAPI.tabs.create({ url: `https://www.threads.com/@${username}` });
      });
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
      browserAPI.storage.local.set({ profileCache: {} }, () => {
        profiles = {};
        loadProfiles();
        showToast(browserAPI.i18n.getMessage('cacheCleared') || 'Cache cleared!');
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
      padding: 8px 16px;
      background: ${isError ? '#ef4444' : '#10b981'};
      color: white;
      border-radius: 6px;
      font-size: 13px;
      z-index: 1000;
      animation: fadeIn 0.2s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s';
      setTimeout(() => toast.remove(), 200);
    }, 2000);
  }

  // Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
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
      locationStatsListEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📍</div>
          <div class="empty-state-text">
            ${emptyMsg.replace(/\n/g, '<br>')}
          </div>
        </div>
      `;
      return;
    }

    const maxCount = sortedLocations[0][1];

    let html = sortedLocations.map(([location, count]) => {
      const percentage = (count / maxCount) * 100;
      return `
        <div class="location-stat-item" data-location="${escapeHtml(location)}">
          <div class="location-info">
                        <div class="location-content">
              <div class="location-name">${escapeHtml(location)}</div>
              <div class="location-bar">
                <div class="location-bar-fill" style="width: ${percentage}%"></div>
              </div>
            </div>
          </div>
          <span class="location-count">${count}</span>
        </div>
      `;
    }).join('');

    // Add "No location" entry if there are profiles without location
    if (noLocationCount > 0) {
      const noLocLabel = browserAPI.i18n.getMessage('noLocation') || 'No location';
      html += `
        <div class="location-stat-item" data-location="" style="opacity: 0.6;">
          <div class="location-info">
                        <div class="location-content">
              <div class="location-name">${escapeHtml(noLocLabel)}</div>
            </div>
          </div>
          <span class="location-count">${noLocationCount}</span>
        </div>
      `;
    }

    locationStatsListEl.innerHTML = html;

    // Add click handlers to filter by location
    locationStatsListEl.querySelectorAll('.location-stat-item').forEach(item => {
      item.addEventListener('click', () => {
        const location = item.dataset.location;
        // Switch to profiles tab and filter
        if (location === '') {
          // "No location" was clicked
          filterNoLocation = true;
          filterText = '';
          locationFilter.value = '';
        } else {
          filterNoLocation = false;
          filterText = location;
          locationFilter.value = location;
        }
        activeTab = 'profiles';
        tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === 'profiles'));
        profilesTab.classList.add('active');
        locationsTab.classList.remove('active');
        renderProfileList();
      });
    });
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
