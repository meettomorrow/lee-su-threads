import { describe, it, expect } from 'vitest';

// Copy the functions from background.js for testing
function compareVersions(v1, v2) {
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

function shouldShowOnboarding(lastSeenVersion, currentVersion, minVersion) {
  // No version recorded - existing user, show once
  if (!lastSeenVersion) return true;

  // Compare last seen version with minimum required version
  // Show if user's last version is below the minimum
  return compareVersions(lastSeenVersion, minVersion) < 0;
}

describe('Version Comparison', () => {
  describe('compareVersions', () => {
    it('should return 0 for equal versions', () => {
      expect(compareVersions('0.3.5', '0.3.5')).toBe(0);
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('2.1.3', '2.1.3')).toBe(0);
    });

    it('should return 1 when v1 > v2', () => {
      expect(compareVersions('0.3.6', '0.3.5')).toBe(1);
      expect(compareVersions('0.4.0', '0.3.9')).toBe(1);
      expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
      expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    });

    it('should return -1 when v1 < v2', () => {
      expect(compareVersions('0.3.5', '0.3.6')).toBe(-1);
      expect(compareVersions('0.3.9', '0.4.0')).toBe(-1);
      expect(compareVersions('0.9.9', '1.0.0')).toBe(-1);
      expect(compareVersions('1.9.9', '2.0.0')).toBe(-1);
    });

    it('should handle different version lengths', () => {
      expect(compareVersions('1.0', '1.0.0')).toBe(0);
      expect(compareVersions('1.0.0', '1.0')).toBe(0);
      expect(compareVersions('1.0.1', '1.0')).toBe(1);
      expect(compareVersions('1.0', '1.0.1')).toBe(-1);
    });

    it('should handle major version differences', () => {
      expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    });

    it('should handle minor version differences', () => {
      expect(compareVersions('0.4.0', '0.3.9')).toBe(1);
      expect(compareVersions('0.3.0', '0.4.0')).toBe(-1);
    });

    it('should handle patch version differences', () => {
      expect(compareVersions('0.3.6', '0.3.5')).toBe(1);
      expect(compareVersions('0.3.5', '0.3.6')).toBe(-1);
    });
  });

  describe('shouldShowOnboarding', () => {
    it('should show onboarding for users with no recorded version (existing users)', () => {
      expect(shouldShowOnboarding(null, '0.3.5', '0.3.5')).toBe(true);
      expect(shouldShowOnboarding(undefined, '0.3.5', '0.3.5')).toBe(true);
    });

    it('should show onboarding when lastSeenVersion < minVersion', () => {
      // Users on 0.3.4 upgrading to 0.3.5 (min version 0.3.5)
      expect(shouldShowOnboarding('0.3.4', '0.3.5', '0.3.5')).toBe(true);

      // Users on 0.3.x upgrading to 0.4.0 (min version 0.4.0)
      expect(shouldShowOnboarding('0.3.5', '0.4.0', '0.4.0')).toBe(true);
      expect(shouldShowOnboarding('0.3.9', '0.4.0', '0.4.0')).toBe(true);

      // Users on 0.x upgrading to 1.0.0 (min version 1.0.0)
      expect(shouldShowOnboarding('0.9.9', '1.0.0', '1.0.0')).toBe(true);
    });

    it('should NOT show onboarding when lastSeenVersion >= minVersion', () => {
      // User already saw onboarding at 0.3.5, upgrading to 0.3.6 (min still 0.3.5)
      expect(shouldShowOnboarding('0.3.5', '0.3.6', '0.3.5')).toBe(false);
      expect(shouldShowOnboarding('0.3.6', '0.3.7', '0.3.5')).toBe(false);
      expect(shouldShowOnboarding('0.3.8', '0.3.9', '0.3.5')).toBe(false);

      // User already saw onboarding at 0.4.0, upgrading to 0.4.1 (min still 0.4.0)
      expect(shouldShowOnboarding('0.4.0', '0.4.1', '0.4.0')).toBe(false);
      expect(shouldShowOnboarding('0.4.1', '0.4.2', '0.4.0')).toBe(false);

      // User already on a higher version than min
      expect(shouldShowOnboarding('0.5.0', '0.5.1', '0.4.0')).toBe(false);
    });

    it('should handle real-world upgrade scenarios', () => {
      const MIN_VERSION_0_3_5 = '0.3.5';

      // Scenario 1: Existing user (0.3.4 or earlier) upgrades to 0.3.5
      expect(shouldShowOnboarding(null, '0.3.5', MIN_VERSION_0_3_5)).toBe(true); // Existing user, no version recorded
      expect(shouldShowOnboarding('0.3.4', '0.3.5', MIN_VERSION_0_3_5)).toBe(true); // Old version user

      // Scenario 2: User saw onboarding at 0.3.5, now upgrading to 0.3.6-0.3.8
      expect(shouldShowOnboarding('0.3.5', '0.3.6', MIN_VERSION_0_3_5)).toBe(false);
      expect(shouldShowOnboarding('0.3.5', '0.3.7', MIN_VERSION_0_3_5)).toBe(false);
      expect(shouldShowOnboarding('0.3.5', '0.3.8', MIN_VERSION_0_3_5)).toBe(false);

      // Scenario 3: Bump to 0.4.0 with new onboarding
      const MIN_VERSION_0_4_0 = '0.4.0';
      expect(shouldShowOnboarding('0.3.5', '0.4.0', MIN_VERSION_0_4_0)).toBe(true); // Show new onboarding
      expect(shouldShowOnboarding('0.3.9', '0.4.0', MIN_VERSION_0_4_0)).toBe(true);
      expect(shouldShowOnboarding('0.4.0', '0.4.1', MIN_VERSION_0_4_0)).toBe(false); // Already saw it
    });
  });
});
