/**
 * Version comparison and onboarding utilities
 */

/**
 * Compare two semantic version strings
 * @param {string} v1 - First version (e.g., "1.2.3")
 * @param {string} v2 - Second version (e.g., "1.2.4")
 * @returns {number} - Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;
    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }
  return 0;
}

/**
 * Determine if onboarding should be shown based on version tracking
 * @param {string|null} lastSeenVersion - Last version user saw onboarding (null if never)
 * @param {string} minVersion - Minimum version that triggers onboarding
 * @returns {boolean} - True if onboarding should be shown
 */
export function shouldShowOnboarding(lastSeenVersion, minVersion) {
  // No version recorded - existing user, show once
  if (!lastSeenVersion) return true;

  // Compare last seen version with minimum required version
  // Show if user's last version is below the minimum
  return compareVersions(lastSeenVersion, minVersion) < 0;
}
