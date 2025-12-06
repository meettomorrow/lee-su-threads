import { describe, it, expect } from 'vitest';
import { parseJoinedDate, isNewUser } from '../src/lib/dateParser.js';

describe('parseJoinedDate', () => {
  // Supported locales: en, ja, ko, zh_CN, zh_TW

  describe('English (en) format', () => {
    it('should parse "January 2024"', () => {
      const result = parseJoinedDate('January 2024');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0);
    });

    it('should parse "December 2024"', () => {
      const result = parseJoinedDate('December 2024');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(11);
    });

    it('should parse "Jun 2023" (abbreviated)', () => {
      const result = parseJoinedDate('Jun 2023');
      expect(result.getFullYear()).toBe(2023);
      expect(result.getMonth()).toBe(5);
    });

    it('should parse "july 2023" (lowercase)', () => {
      const result = parseJoinedDate('july 2023');
      expect(result.getFullYear()).toBe(2023);
      expect(result.getMonth()).toBe(6);
    });

    it('should parse all English months', () => {
      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      months.forEach((month, index) => {
        const result = parseJoinedDate(`${month} 2024`);
        expect(result.getMonth()).toBe(index);
      });
    });
  });

  describe('Japanese (ja) format', () => {
    it('should parse "2024年1月"', () => {
      const result = parseJoinedDate('2024年1月');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0);
    });

    it('should parse "2024年12月"', () => {
      const result = parseJoinedDate('2024年12月');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(11);
    });

    it('should parse "2023年6月"', () => {
      const result = parseJoinedDate('2023年6月');
      expect(result.getFullYear()).toBe(2023);
      expect(result.getMonth()).toBe(5);
    });

    it('should parse all Japanese months', () => {
      for (let i = 1; i <= 12; i++) {
        const result = parseJoinedDate(`2024年${i}月`);
        expect(result.getMonth()).toBe(i - 1);
      }
    });
  });

  describe('Korean (ko) format', () => {
    it('should parse "2024년 1월"', () => {
      const result = parseJoinedDate('2024년 1월');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0);
    });

    it('should parse "2024년 12월"', () => {
      const result = parseJoinedDate('2024년 12월');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(11);
    });

    it('should parse all Korean months', () => {
      for (let i = 1; i <= 12; i++) {
        const result = parseJoinedDate(`2024년 ${i}월`);
        expect(result.getMonth()).toBe(i - 1);
      }
    });
  });

  describe('Traditional Chinese (zh_TW) format', () => {
    it('should parse "2024年1月"', () => {
      const result = parseJoinedDate('2024年1月');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0);
    });

    it('should parse "2024年11月" (two-digit month)', () => {
      const result = parseJoinedDate('2024年11月');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(10);
    });

    it('should parse "2024年12月"', () => {
      const result = parseJoinedDate('2024年12月');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(11);
    });
  });

  describe('Simplified Chinese (zh_CN) format', () => {
    it('should parse "2024年1月"', () => {
      const result = parseJoinedDate('2024年1月');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0);
    });

    it('should parse "2024年12月"', () => {
      const result = parseJoinedDate('2024年12月');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(11);
    });
  });

  describe('edge cases', () => {
    it('should return null for empty string', () => {
      expect(parseJoinedDate('')).toBeNull();
    });

    it('should return null for null input', () => {
      expect(parseJoinedDate(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(parseJoinedDate(undefined)).toBeNull();
    });

    it('should return null for invalid string', () => {
      expect(parseJoinedDate('Invalid')).toBeNull();
    });

    it('should return null for year only', () => {
      expect(parseJoinedDate('2024')).toBeNull();
    });
  });
});

describe('isNewUser', () => {
  // Use a fixed reference date for consistent tests
  const referenceDate = new Date(2024, 11, 7); // December 7, 2024

  it('should return true for user joined this month', () => {
    expect(isNewUser('December 2024', 2, referenceDate)).toBe(true);
    expect(isNewUser('2024年12月', 2, referenceDate)).toBe(true);
  });

  it('should return true for user joined last month', () => {
    expect(isNewUser('November 2024', 2, referenceDate)).toBe(true);
    expect(isNewUser('2024年11月', 2, referenceDate)).toBe(true);
  });

  it('should return true for user joined 2 months ago (at threshold)', () => {
    expect(isNewUser('October 2024', 2, referenceDate)).toBe(true);
    expect(isNewUser('2024年10月', 2, referenceDate)).toBe(true);
  });

  it('should return false for user joined 3 months ago', () => {
    expect(isNewUser('September 2024', 2, referenceDate)).toBe(false);
    expect(isNewUser('2024年9月', 2, referenceDate)).toBe(false);
  });

  it('should return false for user joined last year', () => {
    expect(isNewUser('January 2024', 2, referenceDate)).toBe(false);
    expect(isNewUser('2023年7月', 2, referenceDate)).toBe(false);
  });

  it('should return false for invalid date string', () => {
    expect(isNewUser('Invalid', 2, referenceDate)).toBe(false);
    expect(isNewUser(null, 2, referenceDate)).toBe(false);
  });
});
