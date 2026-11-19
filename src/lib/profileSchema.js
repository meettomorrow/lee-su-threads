/**
 * Version of the profile data we parse from "About this profile".
 *
 * Every profile parsed from that sheet is stamped with `schemaVersion`. Bump
 * PROFILE_SCHEMA_VERSION whenever the parser starts extracting something new:
 * cached profiles with an older version are then fetched again the next time
 * their post badge is on screen (lib/profileRefresh.js), instead of waiting up
 * to 21 days for the cache to expire or asking users to clear it.
 *
 * History:
 *   1 - joined, location, verified (entries from before versioning have no
 *       schemaVersion field and count as 1)
 *   2 - formerUsernames (username-change tag)
 *
 * Pure, side-effect free: no DOM, no browserAPI. Safe to unit-test directly.
 */

export const PROFILE_SCHEMA_VERSION = 2;

/**
 * Schema version of a cached profile; entries from before versioning are 1.
 * @param {Object} profileInfo
 * @returns {number}
 */
export function getProfileSchemaVersion(profileInfo) {
  const version = profileInfo?.schemaVersion;
  return Number.isInteger(version) && version > 0 ? version : 1;
}

/**
 * Whether a cached profile was parsed by an older parser and is worth
 * fetching again. Placeholder entries (no username resolved) are skipped.
 * @param {Object} profileInfo
 * @returns {boolean}
 */
export function isProfileOutdated(profileInfo) {
  if (!profileInfo || typeof profileInfo !== 'object' || profileInfo._userIdOnly) return false;
  return getProfileSchemaVersion(profileInfo) < PROFILE_SCHEMA_VERSION;
}
