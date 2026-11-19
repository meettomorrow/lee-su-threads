import { describe, it, expect } from 'vitest';
import { PROFILE_SCHEMA_VERSION, getProfileSchemaVersion, isProfileOutdated } from '../src/lib/profileSchema.js';

describe('getProfileSchemaVersion', () => {
  it('treats entries from before versioning as version 1', () => {
    expect(getProfileSchemaVersion({ username: 'a', location: '台灣' })).toBe(1);
  });

  it('reads a stored version', () => {
    expect(getProfileSchemaVersion({ schemaVersion: 2 })).toBe(2);
  });

  it.each([0, -1, 1.5, '2', null])('falls back to 1 for invalid version %p', (schemaVersion) => {
    expect(getProfileSchemaVersion({ schemaVersion })).toBe(1);
  });
});

describe('isProfileOutdated', () => {
  it('is true for profiles cached before versioning', () => {
    expect(isProfileOutdated({ username: 'a', location: '台灣', joined: '2025年1月' })).toBe(true);
  });

  it('is true for an older version', () => {
    expect(isProfileOutdated({ username: 'a', schemaVersion: PROFILE_SCHEMA_VERSION - 1 })).toBe(true);
  });

  it('is false for the current version', () => {
    expect(isProfileOutdated({ username: 'a', schemaVersion: PROFILE_SCHEMA_VERSION })).toBe(false);
  });

  it('is false for placeholder entries and non-objects', () => {
    expect(isProfileOutdated({ username: 'user_123', _userIdOnly: true })).toBe(false);
    expect(isProfileOutdated(null)).toBe(false);
    expect(isProfileOutdated(undefined)).toBe(false);
  });
});
