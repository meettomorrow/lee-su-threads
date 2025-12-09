// Injected script to intercept fetch/XHR responses for profile data
import { parseProfileResponse } from './lib/profileParser.js';

'use strict';

// ========== LOGGING HELPERS ==========
function logRequest(type, url, options = {}) {
  const logData = {
    timestamp: new Date().toISOString(),
    type: type,
    url: url,
    method: options.method || 'GET',
    headers: {},
    body: null,
    bodyParsed: null
  };

  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        logData.headers[key] = value;
      });
    } else if (typeof options.headers === 'object') {
      logData.headers = { ...options.headers };
    }
  }

  if (options.body) {
    logData.body = options.body;
    try {
      if (typeof options.body === 'string') {
        if (options.body.startsWith('{')) {
          logData.bodyParsed = JSON.parse(options.body);
        } else {
          const params = new URLSearchParams(options.body);
          logData.bodyParsed = Object.fromEntries(params.entries());
        }
      } else if (options.body instanceof FormData) {
        logData.bodyParsed = {};
        options.body.forEach((value, key) => {
          logData.bodyParsed[key] = value;
        });
      } else if (options.body instanceof URLSearchParams) {
        logData.bodyParsed = Object.fromEntries(options.body.entries());
      }
    } catch (e) {
      logData.bodyParseError = e.message;
    }
  }

  console.group(`%c[Threads Extractor] ${type} Request Captured`, 'color: #667eea; font-weight: bold;');
  console.log('%cURL:', 'color: #10b981; font-weight: bold;', url);
  console.log('%cMethod:', 'color: #10b981; font-weight: bold;', logData.method);
  console.log('%cHeaders:', 'color: #10b981; font-weight: bold;', logData.headers);
  console.log('%cRaw Body:', 'color: #10b981; font-weight: bold;', logData.body);
  console.log('%cParsed Body:', 'color: #10b981; font-weight: bold;', logData.bodyParsed);
  console.log('%cFull Log Object (copy this):', 'color: #f59e0b; font-weight: bold;');
  console.log(JSON.stringify(logData, null, 2));
  console.groupEnd();

  window.dispatchEvent(new CustomEvent('threads-request-logged', { detail: logData }));
  return logData;
}

function logResponse(type, url, responseText) {
  console.group(`%c[Threads Extractor] ${type} Response Captured`, 'color: #764ba2; font-weight: bold;');
  console.log('%cURL:', 'color: #10b981; font-weight: bold;', url);
  console.log('%cResponse Preview:', 'color: #10b981; font-weight: bold;', responseText?.substring(0, 500));
  console.groupEnd();
}

// ========== SESSION TOKENS ==========
let sessionTokens = null;

function captureSessionTokens(bodyParsed) {
  if (bodyParsed && bodyParsed.fb_dtsg) {
    // Preserve existing __user if the captured one is '0' (not logged in indicator)
    const preservedUser = (bodyParsed.__user && bodyParsed.__user !== '0')
      ? bodyParsed.__user
      : (sessionTokens?.__user || '0');

    sessionTokens = {
      fb_dtsg: bodyParsed.fb_dtsg,
      lsd: bodyParsed.lsd,
      jazoest: bodyParsed.jazoest,
      __user: preservedUser,
      __a: bodyParsed.__a,
      __hs: bodyParsed.__hs,
      __dyn: bodyParsed.__dyn,
      __csr: bodyParsed.__csr,
      __comet_req: bodyParsed.__comet_req,
      __ccg: bodyParsed.__ccg,
      __rev: bodyParsed.__rev,
      __s: bodyParsed.__s,
      __hsi: bodyParsed.__hsi,
      __spin_r: bodyParsed.__spin_r,
      __spin_b: bodyParsed.__spin_b,
      __spin_t: bodyParsed.__spin_t,
      dpr: bodyParsed.dpr,
      __d: bodyParsed.__d
    };

    console.log('%c[Threads Extractor] Session tokens captured!', 'color: #10b981; font-weight: bold;');

    window.__threadsExtractorTokens = sessionTokens;
  }
}

// ========== USER ID MAPPING ==========
const userIdMap = new Map();
window.__threadsUserIdMap = userIdMap;
let pendingNewUserIds = {}; // Buffer for new discoveries to broadcast

// Listen for cached user IDs from content script
window.addEventListener('message', (event) => {
  if (event.data?.type === 'threads-load-userid-cache') {
    const cachedUserIds = event.data.data;
    let loadedCount = 0;
    for (const [username, userId] of Object.entries(cachedUserIds)) {
      if (!userIdMap.has(username)) {
        userIdMap.set(username, userId);
        loadedCount++;
      }
    }
    if (loadedCount > 0) {
      console.log(`%c[Threads Extractor] Loaded ${loadedCount} user IDs from cache`, 'color: #22c55e; font-weight: bold;');
    }
  }
});

// Broadcast new user IDs to content script (debounced)
let broadcastTimeout = null;
function broadcastNewUserIds() {
  if (broadcastTimeout) clearTimeout(broadcastTimeout);
  broadcastTimeout = setTimeout(() => {
    if (Object.keys(pendingNewUserIds).length > 0) {
      window.postMessage({ type: 'threads-new-user-ids', data: pendingNewUserIds }, '*');
      pendingNewUserIds = {};
    }
  }, 1000); // Debounce 1 second
}

// Helper to add user ID and queue for persistence
function addUserId(username, userId, source = '') {
  if (!userIdMap.has(username)) {
    userIdMap.set(username, userId);
    pendingNewUserIds[username] = userId;
    broadcastNewUserIds();
    if (source) {
      console.log(`%c[Threads Extractor] Found user (${source}): @${username} -> ${userId}`, 'color: #f59e0b;');
    }
    return true;
  }
  return false;
}

function extractUserIds(obj, source = 'unknown') {
  if (!obj || typeof obj !== 'object') return;

  // Look for user objects with id and username
  if (obj.id && obj.username) {
    const userId = String(obj.id);
    const username = String(obj.username);
    if (userId.match(/^\d+$/) && username.match(/^[\w.]+$/)) {
      addUserId(username, userId, 'id');
    }
  }

  // Check for pk (primary key) - can be string or number
  if (obj.pk && obj.username) {
    const userId = String(obj.pk);
    const username = String(obj.username);
    if (userId.match(/^\d+$/) && username.match(/^[\w.]+$/)) {
      addUserId(username, userId, 'pk');
    }
  }

  // Check for nested user object
  if (obj.user && typeof obj.user === 'object') {
    const user = obj.user;
    const userId = String(user.pk || user.id || '');
    const username = String(user.username || '');
    if (userId.match(/^\d+$/) && username.match(/^[\w.]+$/)) {
      addUserId(username, userId, 'nested');
    }
  }

  // Recurse
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (Array.isArray(value)) {
      value.forEach(item => extractUserIds(item, source));
    } else if (typeof value === 'object' && value !== null) {
      extractUserIds(value, source);
    }
  }
}

// ========== PARSE PROFILE RESPONSE ==========
// parseProfileResponse is imported from lib/profileParser.js

// ========== FETCH INTERCEPTOR ==========
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const url = args[0]?.url || args[0];
  const options = args[1] || {};

  // Capture session tokens
  if (options.body) {
    try {
      let bodyParsed = null;
      if (options.body instanceof URLSearchParams) {
        bodyParsed = Object.fromEntries(options.body.entries());
      } else if (typeof options.body === 'string' && !options.body.startsWith('{')) {
        bodyParsed = Object.fromEntries(new URLSearchParams(options.body).entries());
      }
      if (bodyParsed) {
        captureSessionTokens(bodyParsed);
      }
    } catch (e) { /* ignore */ }
  }

  // Log interesting requests (reduced logging, only for about_this_profile)
  if (typeof url === 'string' && url.includes('about_this_profile')) {
    console.group(`%c[Threads Extractor] 🔍 API Request: ${url.substring(0, 100)}...`, 'color: #3b82f6; font-weight: bold;');
    console.log('%cFull URL:', 'color: #10b981;', url);
    console.groupEnd();
  }

  if (typeof url === 'string' && url.includes('about_this_profile_async_action')) {
    logRequest('FETCH', url, options);
  }

  const response = await originalFetch.apply(this, args);

  // Extract user IDs from responses
  if (typeof url === 'string') {
    try {
      const clone = response.clone();
      const text = await clone.text();
      let jsonStr = text;
      if (jsonStr.startsWith('for (;;);')) {
        jsonStr = jsonStr.substring(9);
      }
      if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
        const data = JSON.parse(jsonStr);

        // Special handling for bulk-route-definitions - this is the goldmine!
        if (url.includes('bulk-route-definitions')) {
          console.log('%c[Threads Extractor] 🎯 Intercepted bulk-route-definitions!', 'color: #f59e0b; font-weight: bold;');
          if (data.payload?.payloads) {
            const beforeCount = userIdMap.size;
            for (const [routeKey, routeData] of Object.entries(data.payload.payloads)) {
              // routeKey is like "/@username" (may be unicode escaped)
              // Decode unicode escapes first
              let decodedKey = routeKey;
              try {
                decodedKey = JSON.parse(`"${routeKey}"`);
              } catch (e) {}

              const usernameMatch = decodedKey.match(/^\/@([\w.]+)/);
              if (usernameMatch) {
                const username = usernameMatch[1];
                const userId = routeData.result?.exports?.rootView?.props?.user_id
                            || routeData.result?.exports?.hostableView?.props?.user_id;
                if (userId) {
                  addUserId(username, String(userId), 'route');
                }
              }
            }
            const afterCount = userIdMap.size;
            if (afterCount > beforeCount) {
              console.log(`%c[Threads Extractor] 🎯 bulk-route-definitions: Found ${afterCount - beforeCount} NEW user(s)`, 'color: #22c55e; font-weight: bold;');
            }
          } else {
            console.log('[Threads Extractor] bulk-route-definitions: No payloads found in response');
          }
        }

        const beforeCount = userIdMap.size;
        extractUserIds(data, url);
        const afterCount = userIdMap.size;
        if (afterCount > beforeCount) {
          console.log(`%c[Threads Extractor] 👤 Found ${afterCount - beforeCount} NEW user(s) in response`, 'color: #22c55e; font-weight: bold;');
        }
      }
    } catch (e) { /* not JSON */ }
  }

  if (typeof url === 'string' && url.includes('about_this_profile_async_action')) {
    try {
      const clone = response.clone();
      const text = await clone.text();
      logResponse('FETCH', url, text);
      const profileInfo = parseProfileResponse(text);
      if (profileInfo && profileInfo.username) {
        delete profileInfo._pairs;
        delete profileInfo._currentLabel;
        delete profileInfo._pairsProcessed;
        console.log('[Threads Extractor] Extracted profile info:', profileInfo);
        window.dispatchEvent(new CustomEvent('threads-profile-extracted', { detail: profileInfo }));
      }
    } catch (e) {
      console.error('[Threads Extractor] Error processing response:', e);
    }
  }

  return response;
};

// ========== XHR INTERCEPTOR ==========
const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;
const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

XMLHttpRequest.prototype.open = function(method, url, ...rest) {
  this._threadsUrl = url;
  this._threadsMethod = method;
  this._threadsHeaders = {};
  return originalXHROpen.apply(this, [method, url, ...rest]);
};

XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
  if (this._threadsHeaders) {
    this._threadsHeaders[name] = value;
  }
  return originalXHRSetRequestHeader.apply(this, [name, value]);
};

XMLHttpRequest.prototype.send = function(...args) {
  const xhrUrl = this._threadsUrl;

  // Handle bulk-route-definitions via XHR
  if (xhrUrl && xhrUrl.includes('bulk-route-definitions')) {
    this.addEventListener('load', function() {
      try {
        console.log('%c[Threads Extractor] 🎯 Intercepted bulk-route-definitions (XHR)!', 'color: #f59e0b; font-weight: bold;');
        let jsonStr = this.responseText;
        if (jsonStr.startsWith('for (;;);')) {
          jsonStr = jsonStr.substring(9);
        }
        const data = JSON.parse(jsonStr);
        if (data.payload?.payloads) {
          const beforeCount = userIdMap.size;
          for (const [routeKey, routeData] of Object.entries(data.payload.payloads)) {
            let decodedKey = routeKey;
            try {
              decodedKey = JSON.parse(`"${routeKey}"`);
            } catch (e) {}

            const usernameMatch = decodedKey.match(/^\/@([\w.]+)/);
            if (usernameMatch) {
              const username = usernameMatch[1];
              const userId = routeData.result?.exports?.rootView?.props?.user_id
                          || routeData.result?.exports?.hostableView?.props?.user_id;
              if (userId) {
                addUserId(username, String(userId), 'route-xhr');
              }
            }
          }
          const afterCount = userIdMap.size;
          if (afterCount > beforeCount) {
            console.log(`%c[Threads Extractor] 🎯 bulk-route-definitions (XHR): Found ${afterCount - beforeCount} NEW user(s)`, 'color: #22c55e; font-weight: bold;');
          }
        }
      } catch (e) {
        console.error('[Threads Extractor] Error processing bulk-route-definitions:', e);
      }
    });
  }

  // Handle about_this_profile
  if (xhrUrl && xhrUrl.includes('about_this_profile_async_action')) {
    logRequest('XHR', xhrUrl, {
      method: this._threadsMethod,
      headers: this._threadsHeaders,
      body: args[0]
    });

    this.addEventListener('load', function() {
      try {
        logResponse('XHR', xhrUrl, this.responseText);
        const profileInfo = parseProfileResponse(this.responseText);
        if (profileInfo && profileInfo.username) {
          delete profileInfo._pairs;
          delete profileInfo._currentLabel;
          delete profileInfo._pairsProcessed;
          console.log('[Threads Extractor] Extracted profile info (XHR):', profileInfo);
          window.dispatchEvent(new CustomEvent('threads-profile-extracted', { detail: profileInfo }));
        }
      } catch (e) {
        console.error('[Threads Extractor] Error processing XHR response:', e);
      }
    });
  }
  return originalXHRSend.apply(this, args);
};

// ========== FETCH PROFILE INFO ==========
async function fetchProfileInfo(targetUserId) {
  if (!sessionTokens) {
    console.error('[Threads Extractor] No session tokens available. Browse the feed first.');
    return null;
  }

  const url = '/async/wbloks/fetch/?appid=com.bloks.www.text_post_app.about_this_profile_async_action&type=app&__bkv=22713cafbb647b89c4e9c1acdea97d89c8c2046e2f4b18729760e9b1ae0724f7';

  const params = new URLSearchParams();
  params.append('__user', '0');  // Always send 0 - auth comes from cookies, not __user param
  params.append('__a', sessionTokens.__a || '1');
  params.append('__req', 'ext_' + Math.random().toString(36).substring(7));
  params.append('__hs', sessionTokens.__hs || '');
  params.append('dpr', sessionTokens.dpr || '2');
  params.append('__ccg', sessionTokens.__ccg || 'UNKNOWN');
  params.append('__rev', sessionTokens.__rev || '');
  params.append('__s', sessionTokens.__s || '');
  params.append('__hsi', sessionTokens.__hsi || '');
  params.append('__dyn', sessionTokens.__dyn || '');
  params.append('__csr', sessionTokens.__csr || '');
  params.append('__comet_req', sessionTokens.__comet_req || '29');
  params.append('fb_dtsg', sessionTokens.fb_dtsg || '');
  params.append('jazoest', sessionTokens.jazoest || '');
  params.append('lsd', sessionTokens.lsd || '');
  params.append('__spin_r', sessionTokens.__spin_r || '');
  params.append('__spin_b', sessionTokens.__spin_b || 'trunk');
  params.append('__spin_t', sessionTokens.__spin_t || '');
  params.append('params', JSON.stringify({
    atpTriggerSessionID: crypto.randomUUID(),
    referer_type: 'TextPostAppProfileOverflow',
    target_user_id: String(targetUserId)
  }));
  params.append('__d', sessionTokens.__d || 'www');

  console.log('[Threads Extractor] Fetching profile info for user ID:', targetUserId);
  if (!sessionTokens.fb_dtsg) {
    console.warn('[Threads Extractor] Warning: fb_dtsg token missing, request may fail');
  }

  try {
    const response = await originalFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-FB-Friendly-Name': 'BarcelonaProfileAboutThisProfileAsyncActionQuery'
      },
      body: params,
      credentials: 'include'
    });

    // Check for rate limiting
    if (response.status === 429) {
      console.warn('[Threads Extractor] ⚠️ Rate limited (429)! Notifying content script...');
      window.dispatchEvent(new CustomEvent('threads-rate-limited'));
      return { _rateLimited: true };
    }

    const text = await response.text();

    const profileInfo = parseProfileResponse(text);
    console.log('[Threads Extractor] Parsed profile info:', profileInfo);

    // If we got profile data but no username, use the target user ID to look up username
    if (profileInfo && !profileInfo.username) {
      // Find username from our map by user ID
      for (const [uname, uid] of userIdMap.entries()) {
        if (uid === String(targetUserId)) {
          profileInfo.username = uname;
          console.log(`[Threads Extractor] Resolved username from map: @${uname}`);
          break;
        }
      }
    }

    if (profileInfo && (profileInfo.username || profileInfo.joined || profileInfo.location)) {
      delete profileInfo._pairs;
      delete profileInfo._currentLabel;
      delete profileInfo._pairsProcessed;
      // If still no username, mark it with the user ID
      if (!profileInfo.username) {
        profileInfo.username = `user_${targetUserId}`;
        profileInfo._userIdOnly = true;
      }
      console.log('[Threads Extractor] Fetched profile info:', profileInfo);
      window.dispatchEvent(new CustomEvent('threads-profile-extracted', { detail: profileInfo }));
      return profileInfo;
    } else {
      console.warn('[Threads Extractor] Could not extract profile info from response. Raw profileInfo:', profileInfo);
    }
  } catch (e) {
    console.error('[Threads Extractor] Error fetching profile info:', e);
  }

  return null;
}

// ========== SCAN PAGE FOR SESSION TOKENS ==========
function scanPageForSessionTokens() {
  console.log('%c[Threads Extractor] 🔑 Scanning page for session tokens...', 'color: #ec4899; font-weight: bold;');

  // Look for fb_dtsg and __user in various places
  const patterns = {
    fb_dtsg: [
      /"fb_dtsg"\s*:\s*"([^"]+)"/,
      /name="fb_dtsg"\s+value="([^"]+)"/,
      /"DTSGInitialData"[^}]*"token"\s*:\s*"([^"]+)"/,
      /\["DTSGInitData",\[\],\{"token":"([^"]+)"/
    ],
    lsd: [
      /"lsd"\s*:\s*"([^"]+)"/,
      /name="lsd"\s+value="([^"]+)"/,
      /"LSD"[^}]*"token"\s*:\s*"([^"]+)"/
    ],
    jazoest: [
      /"jazoest"\s*:\s*"?(\d+)"?/,
      /name="jazoest"\s+value="(\d+)"/
    ],
    __user: [
      /"viewer"\s*:\s*\{[^}]*"id"\s*:\s*"(\d{10,})"/,  // viewer.id (most specific!)
      /"__user"\s*:\s*"?(\d{10,})"?/,  // Match 10+ digits to avoid matching '0'
      /"USER_ID"\s*:\s*"(\d{10,})"/,
      /"userID"\s*:\s*"(\d{10,})"/,
      /"viewerID"\s*:\s*"(\d{10,})"/,
      /"viewer_id"\s*:\s*"?(\d{10,})"?/,
      /"logged_in_user_id"\s*:\s*"?(\d{10,})"?/,
      /"current_user_id"\s*:\s*"?(\d{10,})"?/,
      /\["CurrentUserInitialData"[^\]]*"USER_ID"\s*:\s*"(\d{10,})"/,
      /\["CurrentUserInitialData"[^\]]*"ACCOUNT_ID"\s*:\s*"(\d{10,})"/
    ]
  };

  const foundTokens = {};

  // Scan inline script tags and input fields (much more efficient than scanning entire DOM)
  const scripts = document.querySelectorAll('script:not([src])');
  const inputs = document.querySelectorAll('input[name="fb_dtsg"], input[name="lsd"], input[name="jazoest"]');

  // Check input fields first (fastest)
  inputs.forEach((input) => {
    const name = input.getAttribute('name');
    const value = input.getAttribute('value');
    if (value && !foundTokens[name]) {
      foundTokens[name] = value;
      console.log(`%c  Found ${name} from input: ${value.substring(0, 30)}...`, 'color: #f472b6;');
    }
  });

  // Check script tags
  scripts.forEach((script) => {
    const content = script.textContent || '';

    for (const [tokenName, regexList] of Object.entries(patterns)) {
      if (foundTokens[tokenName]) continue; // Skip if already found

      for (const regex of regexList) {
        const match = content.match(regex);
        if (match) {
          foundTokens[tokenName] = match[1];
          console.log(`%c  Found ${tokenName}: ${match[1].substring(0, 30)}...`, 'color: #f472b6;');
          break;
        }
      }
    }

  });

  if (foundTokens.fb_dtsg) {
    // Merge with existing session tokens or create new
    sessionTokens = {
      ...sessionTokens,
      fb_dtsg: foundTokens.fb_dtsg,
      lsd: foundTokens.lsd || sessionTokens?.lsd || '',
      jazoest: foundTokens.jazoest || sessionTokens?.jazoest || '',
      __user: foundTokens.__user || sessionTokens?.__user || '0',
      __a: sessionTokens?.__a || '1',
      __comet_req: sessionTokens?.__comet_req || '29',
      __d: sessionTokens?.__d || 'www'
    };
    window.__threadsExtractorTokens = sessionTokens;
    console.log('%c  ✅ Session tokens updated from page!', 'color: #22c55e; font-weight: bold;');
  } else {
    console.log('%c  ❌ Could not find fb_dtsg on page', 'color: #ef4444;');
  }

  return foundTokens;
}

// ========== SCAN PAGE FOR USER IDS ==========
function scanPageForUserIds() {
  console.log('%c[Threads Extractor] 🔎 Scanning page for embedded user data...', 'color: #8b5cf6; font-weight: bold;');
  const beforeCount = userIdMap.size;

  // Check ALL script tags with type="application/json"
  const jsonScripts = document.querySelectorAll('script[type="application/json"]');
  console.log(`%c  Found ${jsonScripts.length} JSON script tags`, 'color: #a855f7;');

  jsonScripts.forEach((script, i) => {
    const content = script.textContent || '';
    if (content.includes('"pk"') || content.includes('"username"') || content.includes('"user"')) {
      try {
        const data = JSON.parse(content);
        extractUserIds(data, `json-script#${i}`);
      } catch (e) {
        // Regex fallback - look for pk and username close together
        const pkMatches = [...content.matchAll(/"pk"\s*:\s*"(\d+)"/g)];
        const usernameMatches = [...content.matchAll(/"username"\s*:\s*"([\w.]+)"/g)];

        for (const pkMatch of pkMatches) {
          const pkIndex = pkMatch.index;
          const pk = pkMatch[1];
          for (const userMatch of usernameMatches) {
            const userIndex = userMatch.index;
            const username = userMatch[1];
            if (Math.abs(userIndex - pkIndex) < 500) {
              addUserId(username, pk, 'regex');
              break;
            }
          }
        }
      }
    }
  });

  // Also scan inline scripts for user data
  const inlineScripts = document.querySelectorAll('script:not([src]):not([type])');
  inlineScripts.forEach((script) => {
    const content = script.textContent || '';
    if (content.includes('"pk"') && content.includes('"username"')) {
      const pkMatches = [...content.matchAll(/"pk"\s*:\s*"(\d+)"/g)];
      const usernameMatches = [...content.matchAll(/"username"\s*:\s*"([\w.]+)"/g)];

      for (const pkMatch of pkMatches) {
        const pk = pkMatch[1];
        const pkIndex = pkMatch.index;
        for (const userMatch of usernameMatches) {
          const username = userMatch[1];
          const userIndex = userMatch.index;
          if (Math.abs(userIndex - pkIndex) < 500) {
            addUserId(username, pk, 'inline');
            break;
          }
        }
      }
    }
  });

  const afterCount = userIdMap.size;
  console.log(`%c[Threads Extractor] 📊 Total users discovered: ${afterCount} (${afterCount - beforeCount} new)`, 'color: #8b5cf6; font-weight: bold;');
  if (userIdMap.size > 0) {
    console.log('  Users:', Object.fromEntries(userIdMap));
  }
  return Object.fromEntries(userIdMap);
}

// ========== MESSAGE HANDLERS FOR CONTENT SCRIPT ==========
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;

  // Handle user ID lookup request
  if (event.data?.type === 'threads-userid-request') {
    const { requestId, username } = event.data;
    const userId = userIdMap.get(username) || null;
    console.log(`[Threads Extractor] User ID lookup for @${username}: ${userId}`);
    window.postMessage({
      type: 'threads-userid-response',
      requestId: requestId,
      userId: userId
    }, '*');
  }

  // Handle profile fetch request
  if (event.data?.type === 'threads-fetch-request') {
    const { requestId, userId } = event.data;
    console.log(`[Threads Extractor] Profile fetch request for user ID: ${userId}`);
    const result = await fetchProfileInfo(userId);
    window.postMessage({
      type: 'threads-fetch-response',
      requestId: requestId,
      result: result
    }, '*');
  }

  // Handle scan request (triggered on scroll) - disabled for performance
  // User IDs are captured from API responses automatically
  if (event.data?.type === 'threads-scan-request') {
    // Do nothing - API interception handles new users
  }
});

// ========== EXPOSE FUNCTIONS ==========
window.__threadsFetchProfileInfo = fetchProfileInfo;
window.__threadsGetUserIdMap = () => Object.fromEntries(userIdMap);
window.__threadsGetSessionTokens = () => sessionTokens;
window.__threadsScanPage = scanPageForUserIds;
window.__threadsScanTokens = scanPageForSessionTokens;
window.__threadsScanAll = () => {
  scanPageForSessionTokens();
  scanPageForUserIds();
  return { tokens: sessionTokens, users: Object.fromEntries(userIdMap) };
};

console.log('[Threads Extractor] Network interceptor injected');
console.log('[Threads Extractor] Available functions:');
console.log('  - window.__threadsFetchProfileInfo(userId) - Fetch profile info by user ID');
console.log('  - window.__threadsGetUserIdMap() - Get all discovered username -> userId mappings');
console.log('  - window.__threadsGetSessionTokens() - Get captured session tokens');
console.log('  - window.__threadsScanPage() - Scan page for embedded user data');
console.log('  - window.__threadsScanTokens() - Scan page for session tokens');
console.log('  - window.__threadsScanAll() - Scan for both tokens and users');

// Auto-scan after page loads
if (document.readyState === 'complete') {
  setTimeout(() => {
    scanPageForSessionTokens();
    scanPageForUserIds();
  }, 1000);
} else {
  window.addEventListener('load', () => setTimeout(() => {
  scanPageForSessionTokens();
  scanPageForUserIds();
}, 1000));
}
