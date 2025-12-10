import { describe, it, expect, beforeEach } from 'vitest';
import { findUsernameContainer, detectActiveTab } from '../src/lib/domHelpers.js';
import { JSDOM } from 'jsdom';

describe('domHelpers', () => {
  let document;

  beforeEach(() => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    document = dom.window.document;
    global.document = document;
  });

  describe('detectActiveTab', () => {
    it('should detect first tab as Followers when selected', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div role="tab" aria-selected="true"></div>
        <div role="tab" aria-selected="false"></div>
      `;
      const tabs = container.querySelectorAll('[role="tab"]');

      const result = detectActiveTab(tabs);

      expect(result.isFollowers).toBe(true);
      expect(result.isFollowing).toBe(false);
    });

    it('should detect second tab as Following when selected', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div role="tab" aria-selected="false"></div>
        <div role="tab" aria-selected="true"></div>
      `;
      const tabs = container.querySelectorAll('[role="tab"]');

      const result = detectActiveTab(tabs);

      expect(result.isFollowers).toBe(false);
      expect(result.isFollowing).toBe(true);
    });

    it('should return false for both when no tab is selected', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div role="tab" aria-selected="false"></div>
        <div role="tab" aria-selected="false"></div>
      `;
      const tabs = container.querySelectorAll('[role="tab"]');

      const result = detectActiveTab(tabs);

      expect(result.isFollowers).toBe(false);
      expect(result.isFollowing).toBe(false);
    });
  });

  describe('findUsernameContainer', () => {
    it('should find container with button for a given username', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="user-row">
          <a href="/@testuser">testuser</a>
          <button role="button">Follow</button>
        </div>
      `;

      const result = findUsernameContainer(container, 'testuser');

      expect(result).not.toBeNull();
      expect(result.querySelector('[role="button"]')).not.toBeNull();
    });

    it('should return null when profile link is not found', () => {
      const container = document.createElement('div');
      container.innerHTML = `<div></div>`;

      const result = findUsernameContainer(container, 'nonexistent');

      expect(result).toBeNull();
    });

    it('should return null when no button sibling exists', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div>
          <a href="/@testuser">testuser</a>
          <span>No button here</span>
        </div>
      `;

      const result = findUsernameContainer(container, 'testuser');

      expect(result).toBeNull();
    });

    it('should work with nested structure', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="outer">
          <div class="middle">
            <div class="inner">
              <a href="/@testuser">testuser</a>
            </div>
            <button role="button">Following</button>
          </div>
        </div>
      `;

      const result = findUsernameContainer(container, 'testuser');

      expect(result).not.toBeNull();
      expect(result.querySelector('[role="button"]')).not.toBeNull();
    });

    it('should exclude link buttons (only accept actual button elements)', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <div class="user-row">
          <a href="/@testuser">testuser</a>
          <a role="button">This is a link button</a>
        </div>
      `;

      const result = findUsernameContainer(container, 'testuser');

      expect(result).toBeNull();
    });

    it('should find container with real Threads follower row structure (Follow Back)', () => {
      const container = document.createElement('div');
      // Simplified structure based on actual Threads HTML (Follow Back button case)
      container.innerHTML = `
        <div class="x78zum5 x1q0g3np x1493c5g x1ypdohk xnvo3vl" data-pressable-container="true">
          <div class="xg7h5cd x1120s5i">
            <div class="html-div xdj266r x14z9mp">
              <img alt="testuser profile" src="profile.jpg">
            </div>
          </div>
          <div class="x1qv9dbp x1q0q8m5 x1co6499 x78zum5 xdt5ytf x1iyjqo2 xeuugli">
            <div class="x6s0dn4 x78zum5 x1q0g3np x1iyjqo2 x1qughib x64yxkv">
              <div class="x78zum5 xdt5ytf x5kalc8 xl56j7k xeuugli xf159sx">
                <div class="x6s0dn4 x78zum5">
                  <span class="x6s0dn4 x78zum5 x1q0g3np">
                    <div>
                      <span>
                        <div>
                          <a href="/@testuser" role="link">
                            <span>testuser</span>
                          </a>
                        </div>
                      </span>
                    </div>
                  </span>
                </div>
                <div class="x6s0dn4 x78zum5">
                  <span>Test User</span>
                </div>
              </div>
              <button class="x1i10hfl xjbqb8w" role="button">
                <div>フォローバック</div>
              </button>
            </div>
          </div>
        </div>
      `;

      const result = findUsernameContainer(container, 'testuser');

      expect(result).not.toBeNull();
      // Verify the button is a direct child
      const buttons = Array.from(result.children).filter(child =>
        child.getAttribute && child.getAttribute('role') === 'button'
      );
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should find container with real Threads follower row structure (Following)', () => {
      const container = document.createElement('div');
      // Simplified structure based on actual Threads HTML (Following button case)
      container.innerHTML = `
        <div class="x78zum5 x1q0g3np x1493c5g x1ypdohk xnvo3vl" data-pressable-container="true">
          <div class="xg7h5cd x1120s5i">
            <div class="html-div xdj266r x14z9mp">
              <img alt="testuser2 profile" src="profile.jpg">
            </div>
          </div>
          <div class="x1qv9dbp x1q0q8m5 x1co6499 x78zum5 xdt5ytf x1iyjqo2 xeuugli">
            <div class="x6s0dn4 x78zum5 x1q0g3np x1iyjqo2 x1qughib x64yxkv">
              <div class="x78zum5 xdt5ytf x5kalc8 xl56j7k xeuugli xf159sx">
                <div class="x6s0dn4 x78zum5">
                  <span class="x6s0dn4 x78zum5 x1q0g3np">
                    <div>
                      <span>
                        <div>
                          <a href="/@testuser2" role="link">
                            <span>testuser2</span>
                          </a>
                        </div>
                      </span>
                    </div>
                  </span>
                </div>
                <div class="x6s0dn4 x78zum5">
                  <span>Test User 2</span>
                </div>
              </div>
              <button class="x1i10hfl xjbqb8w" role="button">
                <div>フォロー中</div>
              </button>
            </div>
          </div>
        </div>
      `;

      const result = findUsernameContainer(container, 'testuser2');

      expect(result).not.toBeNull();
      // Verify the button is a direct child
      const buttons = Array.from(result.children).filter(child =>
        child.getAttribute && child.getAttribute('role') === 'button'
      );
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should find container with real Threads structure (own profile, no button)', () => {
      const container = document.createElement('div');
      // Simplified structure based on actual Threads HTML (own profile - no follow button)
      container.innerHTML = `
        <div class="x78zum5 x1q0g3np x1493c5g x1ypdohk xnvo3vl" data-pressable-container="true">
          <div class="xg7h5cd x1120s5i">
            <div class="html-div xdj266r x14z9mp">
              <img alt="ownuser profile" src="profile.jpg">
            </div>
          </div>
          <div class="x1qv9dbp x1q0q8m5 x1co6499 x78zum5 xdt5ytf x1iyjqo2 xeuugli">
            <div class="x6s0dn4 x78zum5 x1q0g3np x1iyjqo2 x1qughib x64yxkv">
              <div class="x78zum5 xdt5ytf x5kalc8 xl56j7k xeuugli xf159sx">
                <div class="x6s0dn4 x78zum5">
                  <span class="x6s0dn4 x78zum5 x1q0g3np">
                    <div>
                      <span>
                        <div>
                          <a href="/@ownuser" role="link">
                            <span>ownuser</span>
                          </a>
                        </div>
                      </span>
                    </div>
                  </span>
                </div>
                <div class="x6s0dn4 x78zum5">
                  <span>Own User</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      const result = findUsernameContainer(container, 'ownuser');

      // Should return null because there's no button (own profile case)
      expect(result).toBeNull();
    });
  });
});
