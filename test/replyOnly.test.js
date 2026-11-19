import { describe, it, expect } from 'vitest';
import {
  MAX_THREADS,
  LOW_FOLLOWER_THRESHOLD,
  REPLY_PAGE_SIZE,
  parseThreadCount,
  parseProfilePage,
  parseHasManyReplies,
  isLowFollowerReplier,
  isReplierCheckSettled,
  getReplyAuthorId,
  collectReplyAuthorIds,
} from '../src/lib/replyOnly.js';

// Minimal post object shaped like Threads feed / profile tab responses (only
// the fields the detector reads).
function post(userPk, isReply) {
  return {
    pk: `post_${userPk}`,
    user: { pk: userPk, username: `user${userPk}` },
    text_post_app_info: { is_reply: isReply },
  };
}

function edges(n) {
  return Array.from({ length: n }, (_, i) => ({ node: { thread_items: [{ post: post(String(i + 1), false) }] } }));
}

// A profile that passes every gate; tests override one signal at a time.
const lowFollowerReplier = { threadCount: 0, followerCount: 0, blocking: false, hasManyReplies: true };

describe('thresholds', () => {
  it('flags at most 5 threads, fewer than 10 followers, more than one page of 10 replies', () => {
    expect(MAX_THREADS).toBe(5);
    expect(LOW_FOLLOWER_THRESHOLD).toBe(10);
    expect(REPLY_PAGE_SIZE).toBe(10);
  });
});

describe('parseThreadCount', () => {
  it('counts the threads returned', () => {
    expect(parseThreadCount({ data: { mediaData: { edges: [] } } })).toBe(0);
    expect(parseThreadCount({ data: { mediaData: { edges: edges(MAX_THREADS + 1) } } })).toBe(MAX_THREADS + 1);
  });

  // Private account the viewer does not follow: Threads answers with an
  // error and no data. That must stay "unknown", never "no threads".
  it('returns null for a Forbidden (private account) response', () => {
    const json = { errors: [{ message: 'execution error', code: 4630005, summary: 'Forbidden' }] };
    expect(parseThreadCount(json)).toBeNull();
  });

  it('returns null when the query shape is unexpected', () => {
    expect(parseThreadCount({ data: { mediaData: null } })).toBeNull();
    expect(parseThreadCount(null)).toBeNull();
  });
});

describe('parseProfilePage', () => {
  it('reads follower count and block state', () => {
    const json = { data: { user: { follower_count: 5, friendship_status: { blocking: false, following: false } } } };
    expect(parseProfilePage(json)).toEqual({ followerCount: 5, blocking: false });
  });

  it('reports accounts the viewer blocked', () => {
    const json = { data: { user: { follower_count: 0, friendship_status: { blocking: true } } } };
    expect(parseProfilePage(json)).toEqual({ followerCount: 0, blocking: true });
  });

  it('returns null when the follower count is missing', () => {
    expect(parseProfilePage({ data: { user: {} } })).toBeNull();
    expect(parseProfilePage({ data: { user: { follower_count: null } } })).toBeNull();
    expect(parseProfilePage({ errors: [{ message: 'execution error' }] })).toBeNull();
    expect(parseProfilePage(null)).toBeNull();
  });
});

describe('parseHasManyReplies', () => {
  it('is true when the replies tab has another page', () => {
    const json = { data: { mediaData: { edges: edges(REPLY_PAGE_SIZE), page_info: { has_next_page: true } } } };
    expect(parseHasManyReplies(json)).toBe(true);
  });

  it('is false when all replies fit on one page', () => {
    const json = { data: { mediaData: { edges: edges(3), page_info: { has_next_page: false } } } };
    expect(parseHasManyReplies(json)).toBe(false);
  });

  // A stale Replies tab doc_id fails with an execution error.
  it('returns null when the query failed', () => {
    expect(parseHasManyReplies({ errors: [{ message: 'execution error' }] })).toBeNull();
    expect(parseHasManyReplies(null)).toBeNull();
  });
});

describe('isLowFollowerReplier', () => {
  it('tags an account that passes every gate', () => {
    expect(isLowFollowerReplier(lowFollowerReplier)).toBe(true);
    expect(isLowFollowerReplier({ ...lowFollowerReplier, threadCount: MAX_THREADS })).toBe(true);
    expect(isLowFollowerReplier({ ...lowFollowerReplier, followerCount: LOW_FOLLOWER_THRESHOLD - 1 })).toBe(true);
  });

  it('does not tag accounts with more than MAX_THREADS threads', () => {
    expect(isLowFollowerReplier({ ...lowFollowerReplier, threadCount: MAX_THREADS + 1 })).toBe(false);
  });

  it('does not tag accounts at or above the follower threshold', () => {
    expect(isLowFollowerReplier({ ...lowFollowerReplier, followerCount: LOW_FOLLOWER_THRESHOLD })).toBe(false);
  });

  it('does not tag accounts the viewer blocked', () => {
    expect(isLowFollowerReplier({ ...lowFollowerReplier, blocking: true })).toBe(false);
  });

  it('does not tag accounts whose replies fit on one page', () => {
    expect(isLowFollowerReplier({ ...lowFollowerReplier, hasManyReplies: false })).toBe(false);
  });

  // Gates stop early and older cache entries lack fields; a missing signal
  // must never count as a pass.
  it.each(['threadCount', 'followerCount', 'blocking', 'hasManyReplies'])(
    'does not tag when %s is unknown',
    (field) => {
      const profile = { ...lowFollowerReplier };
      delete profile[field];
      expect(isLowFollowerReplier(profile)).toBe(false);
    }
  );

  it('does not tag a null profile', () => {
    expect(isLowFollowerReplier(null)).toBe(false);
  });
});

describe('isReplierCheckSettled', () => {
  it('is settled when every gate passed', () => {
    expect(isReplierCheckSettled(lowFollowerReplier)).toBe(true);
    expect(isReplierCheckSettled({ ...lowFollowerReplier, hasManyReplies: false })).toBe(true);
  });

  it('is settled when a gate stopped the check early', () => {
    expect(isReplierCheckSettled({ threadCount: MAX_THREADS + 1 })).toBe(true);
    expect(isReplierCheckSettled({ threadCount: 0, followerCount: LOW_FOLLOWER_THRESHOLD, blocking: false })).toBe(true);
    expect(isReplierCheckSettled({ threadCount: 0, followerCount: 0, blocking: true })).toBe(true);
  });

  // Profiles cached before the check existed, or cached where the user was
  // not seen replying, have none of the signals.
  it('is not settled for a location-only cache entry', () => {
    expect(isReplierCheckSettled({ username: 'a', location: 'Taiwan', joined: 'May 2025' })).toBe(false);
    expect(isReplierCheckSettled(null)).toBe(false);
  });

  it('is not settled when a request failed partway', () => {
    expect(isReplierCheckSettled({ threadCount: 0 })).toBe(false);
    expect(isReplierCheckSettled({ threadCount: 0, followerCount: 0, blocking: false })).toBe(false);
  });
});

describe('getReplyAuthorId', () => {
  it('returns the author of a reply', () => {
    expect(getReplyAuthorId(post('71854422382', true))).toBe('71854422382');
  });

  it('ignores original threads', () => {
    expect(getReplyAuthorId(post('71854422382', false))).toBeNull();
  });

  it('ignores objects without an explicit is_reply flag', () => {
    expect(getReplyAuthorId({ user: { pk: '1' }, text_post_app_info: {} })).toBeNull();
    expect(getReplyAuthorId({ user: { pk: '1' } })).toBeNull();
  });

  it('ignores non-numeric author IDs', () => {
    expect(getReplyAuthorId(post('abc', true))).toBeNull();
  });
});

describe('collectReplyAuthorIds', () => {
  it('collects reply authors from a nested thread, skipping original posters', () => {
    // Shape of a post page / Replies-tab edge: the parent thread, then replies.
    const response = {
      data: {
        mediaData: {
          edges: [
            { node: { thread_items: [{ post: post('111', false) }, { post: post('999', true) }] } },
            { node: { thread_items: [{ post: post('222', false) }, { post: post('888', true) }] } },
          ],
        },
      },
    };
    expect(collectReplyAuthorIds(response)).toEqual(new Set(['999', '888']));
  });

  it('returns an empty set for non-objects', () => {
    expect(collectReplyAuthorIds(null).size).toBe(0);
    expect(collectReplyAuthorIds('text').size).toBe(0);
  });
});
