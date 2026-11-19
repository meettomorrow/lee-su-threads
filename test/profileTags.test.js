import { describe, it, expect } from 'vitest';
import { getProfileTags, TAG_ORDER } from '../src/lib/profileTags.js';

const NOW = new Date(2026, 10, 19); // Nov 2026

const renamed = { raw: '在 Threads 變更過 1 次', count: 1, platform: 'threads' };
const replier = { threadCount: 1, followerCount: 3, blocking: false, hasManyReplies: true };

describe('getProfileTags', () => {
  it('returns no tags for an ordinary profile', () => {
    expect(getProfileTags({ username: 'mei.lin', joined: '2023年7月', formerUsernames: null }, {}, NOW)).toEqual([]);
  });

  it('returns every tag in display order', () => {
    const profile = { username: 'camel.253044', joined: '2026年10月', formerUsernames: renamed, ...replier };
    expect(getProfileTags(profile, {}, NOW)).toEqual(TAG_ORDER);
  });

  it('skips the new-user tag for verified accounts', () => {
    expect(getProfileTags({ username: 'a', joined: '2026年10月', isVerified: true }, {}, NOW)).toEqual([]);
  });

  it('honours the tag toggles', () => {
    const profile = { username: 'camel.253044', joined: '2026年10月', formerUsernames: renamed, ...replier };
    const settings = { usernameChangeEnabled: false, disposableAccountEnabled: false, replyOnlyEnabled: false };
    expect(getProfileTags(profile, settings, NOW)).toEqual(['newUser']);
  });

  it('treats missing toggles as on', () => {
    expect(getProfileTags({ username: 'a', formerUsernames: renamed }, undefined, NOW)).toEqual(['usernameChange']);
  });

  it('returns [] for non-objects', () => {
    expect(getProfileTags(null)).toEqual([]);
    expect(getProfileTags(undefined)).toEqual([]);
  });
});
