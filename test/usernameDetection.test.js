import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

/**
 * Tests for username detection logic in various post scenarios
 * This simulates the logic from addFetchButtons() in content.js
 */
describe('Username Detection in Posts', () => {
  let document;

  beforeEach(() => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    document = dom.window.document;
    global.document = document;
  });

  /**
   * Helper function to extract username from a time element
   * This replicates the logic from content.js addFetchButtons()
   */
  function extractUsernameFromTimeElement(timeEl) {
    let profileLink = null;
    let username = null;

    // First, try to find a profile link that's an ancestor of the time element
    const parentLink = timeEl.closest('a[href^="/@"]');
    if (parentLink) {
      const href = parentLink.getAttribute('href');
      // Match username links (with optional query params/hash), but not post links
      const match = href.match(/^\/@([\w.]+)(?:[?#]|$)/);
      if (match) {
        username = match[1];
        profileLink = parentLink;
      }
    }

    // If not found, traverse up to find a nearby username link
    if (!username) {
      let current = timeEl;
      for (let i = 0; i < 8 && current; i++) {
        current = current.parentElement;
        if (!current) break;

        const usernameLinks = current.querySelectorAll('a[href^="/@"]');
        for (const link of usernameLinks) {
          const href = link.getAttribute('href');
          // Match username links (with optional query params/hash), but not post links
          const match = href.match(/^\/@([\w.]+)(?:[?#]|$)/);
          if (match) {
            username = match[1];
            profileLink = link;
            break;
          }
        }
        if (username) break;
      }
    }

    return username;
  }

  describe('Normal Posts (single author)', () => {
    it('should extract username from a simple post', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div data-pressable-container="true">
          <a href="/@alice">alice</a>
          <a href="/@alice/post/123">
            <time datetime="2025-12-20T10:00:00Z">10 hours ago</time>
          </a>
        </div>
      `;

      const timeEl = container.querySelector('time');
      const username = extractUsernameFromTimeElement(timeEl);

      expect(username).toBe('alice');
    });

    it('should handle username links with query parameters', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div data-pressable-container="true">
          <a href="/@bob?ref=timeline">bob</a>
          <a href="/@bob/post/456">
            <time datetime="2025-12-20T10:00:00Z">5 hours ago</time>
          </a>
        </div>
      `;

      const timeEl = container.querySelector('time');
      const username = extractUsernameFromTimeElement(timeEl);

      expect(username).toBe('bob');
    });

    it('should handle username links with hash fragments', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div data-pressable-container="true">
          <a href="/@charlie#section">charlie</a>
          <a href="/@charlie/post/789">
            <time datetime="2025-12-20T10:00:00Z">2 hours ago</time>
          </a>
        </div>
      `;

      const timeEl = container.querySelector('time');
      const username = extractUsernameFromTimeElement(timeEl);

      expect(username).toBe('charlie');
    });
  });

  describe('Reposts (multiple authors)', () => {
    it('should extract original poster username, not reposter', () => {
      // Simplified structure based on repost.html
      const container = document.createElement('div');
      container.innerHTML = `
        <div data-pressable-container="true">
          <!-- Reposter link (appears first in DOM) -->
          <div class="repost-header">
            <a href="/@reposter_user">reposter_user</a>
            <span> reposted 4 hours ago</span>
          </div>

          <!-- Original post content -->
          <div class="original-post">
            <a href="/@original_author">original_author</a>
            <div>
              <a href="/@original_author/post/123">
                <time datetime="2025-12-19T11:59:34.000Z">19 hours ago</time>
              </a>
            </div>
          </div>
        </div>
      `;

      const timeEl = container.querySelector('time');
      const username = extractUsernameFromTimeElement(timeEl);

      // Should extract original_author, not reposter_user
      expect(username).toBe('original_author');
    });

    it('should handle repost with realistic Threads structure', () => {
      // Based on actual repost.html structure (sanitized)
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="x1n2onr6 x1ypdohk" data-pressable-container="true">
          <div class="xqcrz7y x1xdureb x1agbcgv">
            <div class="x6s0dn4 xrvj5dj xd0jker xsag5q8">
              <div class="x1xdureb x11t971q">
                <div class="">
                  <span class="xjp7ctv">
                    <div>
                      <a class="x1i10hfl xjbqb8w" href="/@reposter123" role="link">
                        <span>reposter123</span>
                        <span> 在 4 小時前轉發</span>
                      </a>
                    </div>
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div class="xrvj5dj x79809l x5yr21d">
            <div class="x6s0dn4 x78zum5 x1q0g3np">
              <span class="x6s0dn4 x78zum5 x1q0g3np">
                <div class="">
                  <span class="xjp7ctv">
                    <div>
                      <a class="x1i10hfl xjbqb8w" href="/@originaluser" role="link">
                        <span>originaluser</span>
                      </a>
                    </div>
                  </span>
                </div>
              </span>
            </div>
            <div class="x6s0dn4 xmixu3c x78zum5 x5yr21d">
              <div class="x78zum5 x1c4vz4f x2lah0s">
                <span class="x1lliihq x1plvlek xryxfnj">
                  <a class="x1i10hfl xjbqb8w" href="/@originaluser/post/DScbldbk5ym" role="link">
                    <time datetime="2025-12-19T11:59:34.000Z" data-threads-info-added="true">
                      <span><abbr><span>19小時</span></abbr></span>
                    </time>
                  </a>
                </span>
              </div>
            </div>
          </div>
        </div>
      `;

      const timeEl = container.querySelector('time');
      const username = extractUsernameFromTimeElement(timeEl);

      // Should extract originaluser, not reposter123
      expect(username).toBe('originaluser');
    });
  });

  describe('Edge Cases', () => {
    it('should handle posts with usernames containing dots', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div data-pressable-container="true">
          <a href="/@user.with.dots">user.with.dots</a>
          <a href="/@user.with.dots/post/999">
            <time datetime="2025-12-20T10:00:00Z">1 hour ago</time>
          </a>
        </div>
      `;

      const timeEl = container.querySelector('time');
      const username = extractUsernameFromTimeElement(timeEl);

      expect(username).toBe('user.with.dots');
    });

    it('should NOT match post links as username links', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div data-pressable-container="true">
          <!-- Only has a post link, no profile link -->
          <a href="/@testuser/post/123">
            <time datetime="2025-12-20T10:00:00Z">3 hours ago</time>
          </a>
          <a href="/@testuser">testuser (this should be found)</a>
        </div>
      `;

      const timeEl = container.querySelector('time');
      const username = extractUsernameFromTimeElement(timeEl);

      // Should find testuser from the profile link
      expect(username).toBe('testuser');
    });

    it('should handle deeply nested time elements', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div data-pressable-container="true">
          <a href="/@deepuser">deepuser</a>
          <div>
            <div>
              <div>
                <div>
                  <a href="/@deepuser/post/777">
                    <span>
                      <span>
                        <time datetime="2025-12-20T10:00:00Z">6 hours ago</time>
                      </span>
                    </span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      const timeEl = container.querySelector('time');
      const username = extractUsernameFromTimeElement(timeEl);

      expect(username).toBe('deepuser');
    });

    it('should handle time element inside username link', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div data-pressable-container="true">
          <a href="/@wrappeduser">
            <span>wrappeduser</span>
            <time datetime="2025-12-20T10:00:00Z">8 hours ago</time>
          </a>
        </div>
      `;

      const timeEl = container.querySelector('time');
      const username = extractUsernameFromTimeElement(timeEl);

      // Time is inside the username link, closest() should find it
      expect(username).toBe('wrappeduser');
    });
  });

  describe('Multiple username mentions (quotes, replies)', () => {
    it('should prefer the username closest to time element', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div data-pressable-container="true">
          <a href="/@mentioned_user">@mentioned_user</a>
          <div class="quote">
            <a href="/@quoted_user">quoted_user</a>
          </div>
          <div class="main-content">
            <a href="/@post_author">post_author</a>
            <a href="/@post_author/post/555">
              <time datetime="2025-12-20T10:00:00Z">4 hours ago</time>
            </a>
          </div>
        </div>
      `;

      const timeEl = container.querySelector('time');
      const username = extractUsernameFromTimeElement(timeEl);

      // Should get post_author, which is closest to the time element
      expect(username).toBe('post_author');
    });
  });
});
