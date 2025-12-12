import { describe, it, expect } from 'vitest';
import { parseProfileResponse } from '../src/lib/profileParser.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name) {
  const fixturePath = path.join(__dirname, 'fixtures', name);
  return fs.readFileSync(fixturePath, 'utf-8');
}

describe('parseProfileResponse', () => {
  describe('basic profiles', () => {
    it('should parse English profile with 100M+ format', () => {
      const response = loadFixture('profile-basic-en.txt');
      const result = parseProfileResponse(response);

      expect(result.username).toBe('testuser');
      expect(result.displayName).toBe('Test User');
      expect(result.joined).toBe('January 2024');
      expect(result.location).toBe('Taiwan');
      expect(result.profileImage).toContain('cdninstagram.com');
    });

    it('should parse Chinese profile with 億+ format', () => {
      const response = loadFixture('profile-basic-zh.txt');
      const result = parseProfileResponse(response);

      expect(result.username).toBe('testuser');
      expect(result.displayName).toBe('Test User');
      expect(result.joined).toBe('2024年1月');
      expect(result.location).toBe('台灣');
    });

    it('should parse Japanese profile with 億人以上 format', () => {
      const response = loadFixture('profile-basic-ja.txt');
      const result = parseProfileResponse(response);

      expect(result.username).toBe('testuser');
      expect(result.displayName).toBe('Test User');
      expect(result.joined).toBe('2023年7月');
      expect(result.location).toBe('台湾');
    });
  });

  describe('verified accounts with extra fields', () => {
    it('should handle profile with Verified by Meta (4 fields)', () => {
      const response = loadFixture('profile-verified.txt');
      const result = parseProfileResponse(response);

      expect(result.username).toBe('testverified');
      expect(result.joined).toBe('July 2023');
      expect(result.location).toBe('United States');
      expect(result.isVerified).toBe(true);
      expect(result.verifiedDate).toBe('May 2021');
    });

    it('should handle own profile with verification (Chinese, 4 fields)', () => {
      const response = loadFixture('profile-own-verified-zh.txt');
      const result = parseProfileResponse(response);

      expect(result.username).toBe('testownverified');
      expect(result.displayName).toBe('測試用戶 Test User');
      expect(result.joined).toBe('2025年11月');
      expect(result.location).toBe('台灣');
      expect(result.isVerified).toBe(true);
      expect(result.verifiedDate).toBe('2019年9月');
      expect(result.profileImage).toContain('cdninstagram.com');
    });

    it('should handle own profile with verification (Japanese, 4 fields)', () => {
      const response = loadFixture('profile-own-verified-ja.txt');
      const result = parseProfileResponse(response);

      expect(result.username).toBe('testownverified');
      expect(result.displayName).toBe('測試用戶 Test User');
      expect(result.joined).toBe('2025年11月');
      expect(result.location).toBe('台湾');
      expect(result.isVerified).toBe(true);
      expect(result.verifiedDate).toBe('2019年9月');
      expect(result.profileImage).toContain('cdninstagram.com');
    });

    it('should handle verified profile (Korean, 4 fields)', () => {
      const response = loadFixture('profile-verified-ko.txt');
      const result = parseProfileResponse(response);

      expect(result.username).toBe('testverifiedko');
      expect(result.displayName).toBe('Test User KO');
      expect(result.joined).toBe('2023년 7월');
      expect(result.location).toBe('미국');
      expect(result.isVerified).toBe(true);
      expect(result.verifiedDate).toBe('2024년 2월');
    });
  });

  describe('hidden location', () => {
    it('should parse Chinese profile with hidden location (未分享)', () => {
      const response = loadFixture('profile-hidden-location-zh.txt');
      const result = parseProfileResponse(response);

      expect(result.username).toBe('ggu__kim');
      expect(result.displayName).toBe('金針菇🇰🇷ㅊㅓㄴㄱㅜ');
      expect(result.joined).toBe('2023年7月');
      expect(result.location).toBe('未分享');
      expect(result.profileImage).toContain('cdninstagram.com');
    });
  });

  describe('profiles without location', () => {
    it('should handle profile with no location field (Japanese, 2 fields)', () => {
      const response = loadFixture('profile-no-location-ja.txt');
      const result = parseProfileResponse(response);

      expect(result.username).toBe('grimeyfresh_32');
      expect(result.displayName).toBe('theoneandonly');
      expect(result.joined).toBe('2024年10月');
      expect(result.location).toBeUndefined();
      expect(result.profileImage).toContain('cdninstagram.com');
    });
  });

  describe('former username handling', () => {
    it('should filter out Japanese former username field', () => {
      const payload = fs.readFileSync(path.join(__dirname, 'fixtures/profile-former-username-ja.txt'), 'utf8');
      const result = parseProfileResponse(payload);

      expect(result.joined).toBe('2025年12月');
      expect(result.location).toBe('日本');
      expect(result.displayName).toBeUndefined(); // Name field should be filtered
      // Former username field should not appear in any extracted data
      expect(JSON.stringify(result)).not.toContain('Instagramで1回変更');
    });

    it('should filter out Chinese former username field', () => {
      const payload = fs.readFileSync(path.join(__dirname, 'fixtures/profile-former-username-zh.txt'), 'utf8');
      const result = parseProfileResponse(payload);

      expect(result.joined).toBe('2025年12月');
      expect(result.location).toBe('台灣');
      expect(result.displayName).toBeUndefined(); // Name field should be filtered
      // Former username field should not appear in any extracted data
      expect(JSON.stringify(result)).not.toContain('在 Instagram 變更過 1 次');
    });
  });

  describe('edge cases', () => {
    it('should return null for invalid JSON', () => {
      const result = parseProfileResponse('not valid json');
      expect(result).toBeNull();
    });

    it('should return empty object for empty response', () => {
      const result = parseProfileResponse('{}');
      expect(result).toEqual({});
    });
  });

  describe('dynamic binding', () => {
    it('should parse location from on_bind conditional (English labels)', () => {
      const response = loadFixture('profile-dynamic-bind.txt');
      const result = parseProfileResponse(response);

      expect(result.username).toBe('testuser123');
      expect(result.displayName).toBe('Test User');
      expect(result.joined).toBe('July 2023');
      // Test Unicode decoding from on_bind (\\u53f0\\u7063 = 台灣)
      expect(result.location).toBe('台灣');
      // Profile image is anonymized in test fixture
      expect(result.profileImage).toBeUndefined();
    });

    it('should parse location from on_bind with Chinese labels', () => {
      const response = loadFixture('profile-chinese-labels.txt');
      const result = parseProfileResponse(response);

      expect(result.username).toBe('testuser');
      expect(result.displayName).toBe('測試用戶');
      expect(result.joined).toBe('2024年1月');
      // Test Unicode decoding with Chinese labels (\\u53f0\\u7063 = 台灣, \\u672a\\u5206\\u4eab = 未分享)
      expect(result.location).toBe('台灣');
    });
  });
});
