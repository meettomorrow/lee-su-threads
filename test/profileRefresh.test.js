import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// profileRefresh.js reads `chrome` at import time and uses IntersectionObserver;
// neither exists in the Node test environment.
const sendMessage = vi.hoisted(() => {
  const fn = vi.fn();
  globalThis.chrome = { runtime: { sendMessage: fn } };
  return fn;
});

vi.mock('../src/lib/profileFetcher.js', () => ({
  getUserIdByUsername: vi.fn(),
  fetchProfileByUserId: vi.fn(),
  checkCachedReplier: vi.fn(),
}));

import { getUserIdByUsername, fetchProfileByUserId, checkCachedReplier } from '../src/lib/profileFetcher.js';
import { createProfileRefresh, planProfileUpdate } from '../src/lib/profileRefresh.js';
import { PROFILE_SCHEMA_VERSION } from '../src/lib/profileSchema.js';

const CURRENT = PROFILE_SCHEMA_VERSION;
const settledReplier = { threadCount: 20 }; // > MAX_THREADS: verdict settled

describe('planProfileUpdate', () => {
  const both = { refresh: true, replier: true };

  it('refreshes an outdated profile first', () => {
    expect(planProfileUpdate({ username: 'a' }, both)).toBe('refresh');
  });

  it('runs the replier check on a current profile without a verdict', () => {
    expect(planProfileUpdate({ username: 'a', schemaVersion: CURRENT }, both)).toBe('replier');
  });

  it('falls through to the replier check when refresh is off', () => {
    expect(planProfileUpdate({ username: 'a' }, { refresh: false, replier: true })).toBe('replier');
  });

  it('does nothing for a current, settled profile', () => {
    expect(planProfileUpdate({ username: 'a', schemaVersion: CURRENT, ...settledReplier }, both)).toBeNull();
  });

  it('does nothing when both kinds are off', () => {
    expect(planProfileUpdate({ username: 'a' }, { refresh: false, replier: false })).toBeNull();
  });

  it('skips placeholder entries and non-objects', () => {
    expect(planProfileUpdate({ username: 'user_1', _userIdOnly: true }, both)).toBeNull();
    expect(planProfileUpdate(undefined, both)).toBeNull();
  });
});

describe('createProfileRefresh', () => {
  let observers;
  let state;
  let profileCache;
  let onUpdated;

  class FakeIntersectionObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = new Set();
      observers.push(this);
    }
    observe(el) { this.observed.add(el); }
    unobserve(el) { this.observed.delete(el); }
  }

  const makeBadge = () => ({ dataset: {}, isConnected: true });

  // Scroll a badge into view long enough to be queued
  async function show(badge) {
    observers[0].callback([{ target: badge, isIntersecting: true }]);
    await vi.advanceTimersByTimeAsync(500);
  }

  function setup(enabled = { refresh: true, replier: true }) {
    return createProfileRefresh({
      state,
      profileCache,
      delayMs: 1600,
      getEnabled: async () => enabled,
      onUpdated,
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    observers = [];
    globalThis.IntersectionObserver = FakeIntersectionObserver;
    state = { autoQueryEnabled: true, rateLimitedUntil: 0, isUserLoggedIn: true, isFetching: false };
    profileCache = new Map();
    onUpdated = vi.fn();
    sendMessage.mockReset();
    getUserIdByUsername.mockReset().mockResolvedValue('123');
    fetchProfileByUserId.mockReset();
    checkCachedReplier.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not watch a profile with nothing to fill in', () => {
    const refresh = setup();
    const profile = { username: 'a', schemaVersion: CURRENT, ...settledReplier };
    refresh.observe(makeBadge(), profile);
    expect(observers[0].observed.size).toBe(0);
  });

  it('refreshes an outdated profile once it has been on screen', async () => {
    const refresh = setup();
    const cached = { username: 'a', location: '台灣', timestamp: 1 };
    profileCache.set('a', cached);
    fetchProfileByUserId.mockResolvedValue({ username: 'a', location: '台灣', schemaVersion: CURRENT, formerUsernames: null });

    const badge = makeBadge();
    refresh.observe(badge, cached);
    await show(badge);

    expect(fetchProfileByUserId).toHaveBeenCalledWith('123', { checkReplyOnly: true });
    const sent = sendMessage.mock.calls[0][0];
    expect(sent.type).toBe('PROFILE_INFO_EXTRACTED');
    expect(sent.data.schemaVersion).toBe(CURRENT);
    expect(sent.data).not.toHaveProperty('timestamp'); // fresh data gets a new timestamp
    expect(onUpdated).toHaveBeenCalledWith(sent.data, badge);
  });

  it('merges onto the latest cache entry, not the one read before the request', async () => {
    const refresh = setup();
    const cached = { username: 'a', location: '台灣' };
    profileCache.set('a', cached);
    fetchProfileByUserId.mockImplementation(async () => {
      // Replier signals land in the cache while the refresh is in flight
      profileCache.set('a', { ...cached, threadCount: 2, followerCount: 3 });
      return { username: 'a', location: '台灣', schemaVersion: CURRENT };
    });

    const badge = makeBadge();
    refresh.observe(badge, cached);
    await show(badge);

    expect(profileCache.get('a')).toMatchObject({ threadCount: 2, followerCount: 3, schemaVersion: CURRENT });
  });

  it('keeps the timestamp when only replier signals were added', async () => {
    const refresh = setup();
    const cached = { username: 'a', schemaVersion: CURRENT, timestamp: 42 };
    profileCache.set('a', cached);
    checkCachedReplier.mockResolvedValue({ threadCount: 1, followerCount: 2, blocking: false, hasManyReplies: true });

    const badge = makeBadge();
    refresh.observe(badge, cached);
    await show(badge);

    expect(fetchProfileByUserId).not.toHaveBeenCalled();
    expect(sendMessage.mock.calls[0][0].data).toMatchObject({ timestamp: 42, hasManyReplies: true });
  });

  it('does not fetch while auto-query is off, rate limited or logged out', async () => {
    for (const blocked of [{ autoQueryEnabled: false }, { rateLimitedUntil: Date.now() + 60_000 }, { isUserLoggedIn: false }]) {
      observers = [];
      Object.assign(state, { autoQueryEnabled: true, rateLimitedUntil: 0, isUserLoggedIn: true }, blocked);
      const refresh = setup();
      const cached = { username: 'a' };
      profileCache.set('a', cached);
      const badge = makeBadge();
      refresh.observe(badge, cached);
      await show(badge);
    }
    expect(getUserIdByUsername).not.toHaveBeenCalled();
    expect(fetchProfileByUserId).not.toHaveBeenCalled();
  });

  it('handles each user at most once per page', async () => {
    const refresh = setup();
    const cached = { username: 'a' };
    profileCache.set('a', cached);
    fetchProfileByUserId.mockResolvedValue(null); // failed: still not retried

    const first = makeBadge();
    refresh.observe(first, cached);
    await show(first);
    const second = makeBadge();
    refresh.observe(second, cached);
    await show(second);

    expect(fetchProfileByUserId).toHaveBeenCalledTimes(1);
  });

  it('paces users that cost requests, even when they arrive one by one', async () => {
    const refresh = setup({ refresh: false, replier: true });
    for (const name of ['a', 'b', 'c', 'd']) profileCache.set(name, { username: name, schemaVersion: CURRENT });
    // b: not seen replying, answered without a request; the others are checked
    checkCachedReplier.mockImplementation(async (name) => (name === 'b' ? null : { threadCount: 20 }));
    const checked = () => checkCachedReplier.mock.calls.map(([name]) => name);

    const badges = {};
    for (const name of ['a', 'b', 'c', 'd']) {
      badges[name] = makeBadge();
      refresh.observe(badges[name], profileCache.get(name));
    }

    await show(badges.a);
    expect(checked()).toEqual(['a']);

    // c arrives right after a finished: it must still wait out the pause
    await show(badges.c);
    expect(checked()).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(1100); // 1600 ms after a
    expect(checked()).toEqual(['a', 'c']);

    // Most recently visible goes first: b, which costs nothing, so d right
    // after it is held back only by c's pause, not by b
    await show(badges.d);
    await show(badges.b);
    expect(checked()).toEqual(['a', 'c']);
    await vi.advanceTimersByTimeAsync(599); // 1599 ms after c
    expect(checked()).toEqual(['a', 'c']);
    await vi.advanceTimersByTimeAsync(1);
    expect(checked()).toEqual(['a', 'c', 'b', 'd']);
  });

  it('waits for the main auto-fetch queue', async () => {
    const refresh = setup();
    state.isFetching = true;
    const cached = { username: 'a' };
    profileCache.set('a', cached);
    fetchProfileByUserId.mockResolvedValue({ username: 'a', schemaVersion: CURRENT });

    const badge = makeBadge();
    refresh.observe(badge, cached);
    await show(badge);
    expect(fetchProfileByUserId).not.toHaveBeenCalled();

    state.isFetching = false;
    await vi.advanceTimersByTimeAsync(1600);
    expect(fetchProfileByUserId).toHaveBeenCalledTimes(1);
  });
});
