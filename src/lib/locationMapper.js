/**
 * Location to Flag Emoji Mapper
 *
 * This module provides locale-aware country flag lookup functionality.
 * It loads country data from data/location-flags.json at runtime.
 */

import locationFlagsData from '../../data/location-flags.json';

// Safely load location flags with validation
const LOCATION_FLAGS = (() => {
  try {
    if (!locationFlagsData || typeof locationFlagsData !== 'object') {
      console.error('[LocationMapper] Invalid location-flags.json: not an object');
      return {};
    }

    const count = Object.keys(locationFlagsData).length;
    if (count === 0) {
      console.warn('[LocationMapper] location-flags.json is empty');
      return {};
    }

    console.log(`[LocationMapper] Successfully loaded ${count} territories`);
    return locationFlagsData;
  } catch (error) {
    console.error('[LocationMapper] Failed to load location-flags.json:', error);
    console.warn('[LocationMapper] Flag lookup will not be available. Location text will be displayed without flags.');
    return {};
  }
})();

// Helper function to normalize a language code to our locale keys
function normalizeLanguage(lang) {
  if (lang.startsWith('zh-TW') || lang.startsWith('zh-Hant')) return 'zh_TW';
  if (lang.startsWith('zh')) return 'zh_CN';
  if (lang.startsWith('ja')) return 'ja';
  if (lang.startsWith('ko')) return 'ko';
  return 'en';
}

// Detect all user's accepted locales once at startup
const userLocales = (() => {
  // Get all accepted languages from browser settings (in preference order)
  const langs = navigator.languages || [navigator.language || 'en'];

  // Normalize each to our locale keys and dedupe
  const normalized = new Set();
  for (const lang of langs) {
    normalized.add(normalizeLanguage(lang));
  }

  return Array.from(normalized);
})();

// Build locale-aware lookup map for multiple locales
function buildLookup(locales) {
  const map = new Map();

  // If LOCATION_FLAGS failed to load, return empty map
  if (!LOCATION_FLAGS || Object.keys(LOCATION_FLAGS).length === 0) {
    return map;
  }

  for (const [flag, translations] of Object.entries(LOCATION_FLAGS)) {
    // Always add common variants (locale-agnostic)
    if (translations.common) {
      for (const variant of translations.common) {
        map.set(variant, flag);
      }
    }

    // Add variants for all user's preferred locales
    for (const locale of locales) {
      if (translations[locale]) {
        for (const variant of translations[locale]) {
          map.set(variant, flag);
        }
      }
    }
  }

  return map;
}

// Build lookup map for user's accepted locales
const locationLookup = buildLookup(userLocales);

/**
 * Get country flag emoji for a location string
 * @param {string} location - Location string from profile
 * @returns {string|null} - Flag emoji or null if not found
 */
export function getLocationFlag(location) {
  if (!location) return null;

  const normalized = location.toLowerCase().trim();

  // Direct match
  if (locationLookup.has(normalized)) {
    return locationLookup.get(normalized);
  }

  // Partial match - check if location contains any known variant
  for (const [variant, flag] of locationLookup.entries()) {
    if (normalized.includes(variant) || variant.includes(normalized)) {
      return flag;
    }
  }

  return null;
}

/**
 * Format location string with optional flag emoji
 * @param {string} location - Location string from profile
 * @param {boolean} flagOnly - If true, return only flag; otherwise return "flag location"
 * @param {boolean} showFlags - If false, skip flag display (from user setting)
 * @param {string|null} customEmoji - Custom emoji override (from user customization)
 * @returns {string} - Formatted location string
 */
export function formatLocation(location, flagOnly = false, showFlags = true, customEmoji = null) {
  if (!location) return '';

  // If flags are disabled, return location text only
  if (!showFlags) {
    return location;
  }

  // Use custom emoji if provided, otherwise get default flag
  const emoji = customEmoji || getLocationFlag(location);

  if (emoji) {
    return flagOnly ? emoji : `${emoji} ${location}`;
  }

  // No flag found - return original location
  return location;
}
