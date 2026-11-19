import { describe, it, expect } from 'vitest';
import { parseFormerUsernames, hasUsernameChange } from '../src/lib/usernameChange.js';

describe('parseFormerUsernames', () => {
  it.each([
    ['在 Threads 變更過 1 次', 1, 'threads'],
    ['在 Instagram 變更過 3 次', 3, 'instagram'],
    ['在 Threads 变更过 2 次', 2, 'threads'],
    ['Instagramで1回変更', 1, 'instagram'],
    ['Threadsで2回変更', 2, 'threads'],
    ['Changed 1 time on Threads', 1, 'threads'],
    ['Changed 12 times on Instagram', 12, 'instagram'],
    ['Threads에서 2번 변경됨', 2, 'threads'],
  ])('%s → count %i, platform %s', (text, count, platform) => {
    expect(parseFormerUsernames(text)).toEqual({ raw: text, count, platform });
  });

  it('keeps the raw text when count and platform are unrecognizable', () => {
    expect(parseFormerUsernames('  Changed once  ')).toEqual({ raw: 'Changed once', count: null, platform: null });
  });

  it.each([undefined, null, '', '   ', 42])('returns null for %p', (value) => {
    expect(parseFormerUsernames(value)).toBeNull();
  });
});

describe('hasUsernameChange', () => {
  it('is true for one or more changes', () => {
    expect(hasUsernameChange({ formerUsernames: { raw: 'x', count: 1, platform: 'threads' } })).toBe(true);
    expect(hasUsernameChange({ formerUsernames: { raw: 'x', count: 5, platform: null } })).toBe(true);
  });

  it('is true when the row is present but the count is unreadable', () => {
    expect(hasUsernameChange({ formerUsernames: { raw: 'Changed once', count: null, platform: null } })).toBe(true);
  });

  it('is false for zero changes or no data', () => {
    expect(hasUsernameChange({ formerUsernames: { raw: '0', count: 0, platform: null } })).toBe(false);
    expect(hasUsernameChange({})).toBe(false);
    expect(hasUsernameChange(null)).toBe(false);
    expect(hasUsernameChange(undefined)).toBe(false);
  });
});
