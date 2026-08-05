import { describe, it, expect } from 'vitest';
import {
  isDisposableHandle,
  DISPOSABLE_MIN_DIGITS,
  DISPOSABLE_MAX_DIGITS,
} from '../src/lib/disposableHandle.js';

describe('isDisposableHandle', () => {
  describe('matches (system default format)', () => {
    it('matches "camel.253044"', () => {
      const result = isDisposableHandle('camel.253044');
      expect(result.isDisposable).toBe(true);
      expect(result.matchedWord).toBe('camel');
      expect(result.digits).toBe('253044');
    });

    it('matches "leopard.7241883"', () => {
      const result = isDisposableHandle('leopard.7241883');
      expect(result.isDisposable).toBe(true);
      expect(result.matchedWord).toBe('leopard');
      expect(result.digits).toBe('7241883');
    });

    it('matches "Camel.253044" (case-insensitive)', () => {
      const result = isDisposableHandle('Camel.253044');
      expect(result.isDisposable).toBe(true);
      expect(result.matchedWord).toBe('camel');
      expect(result.digits).toBe('253044');
    });

    it('matches the minimum digit count (6)', () => {
      expect(isDisposableHandle('otter.123456').isDisposable).toBe(true);
    });

    it('matches the maximum digit count (8)', () => {
      expect(isDisposableHandle('otter.12345678').isDisposable).toBe(true);
    });
  });

  describe('does not match (user-chosen or malformed)', () => {
    it('rejects "leopard1234" (no dot)', () => {
      expect(isDisposableHandle('leopard1234').isDisposable).toBe(false);
    });

    it('rejects "otter_88213" (underscore, not the system separator)', () => {
      expect(isDisposableHandle('otter_88213').isDisposable).toBe(false);
    });

    it('rejects "catherine.1990" (cat is only a substring)', () => {
      const result = isDisposableHandle('catherine.1990');
      expect(result.isDisposable).toBe(false);
      expect(result.matchedWord).toBeNull();
    });

    it('rejects "catlover.887711" (animal word not followed by the dot)', () => {
      expect(isDisposableHandle('catlover.887711').isDisposable).toBe(false);
    });

    it('rejects "camel.253044x" (extra character after the digits)', () => {
      expect(isDisposableHandle('camel.253044x').isDisposable).toBe(false);
    });

    it('rejects "camel.253" (too few digits)', () => {
      expect(isDisposableHandle('camel.253').isDisposable).toBe(false);
    });

    it('rejects "camel.1234567890" (too many digits)', () => {
      expect(isDisposableHandle('camel.1234567890').isDisposable).toBe(false);
    });

    it('rejects "wang.dawei" (no digits)', () => {
      expect(isDisposableHandle('wang.dawei').isDisposable).toBe(false);
    });
  });

  describe('empty / nullish input', () => {
    it('returns not-disposable for empty string', () => {
      const result = isDisposableHandle('');
      expect(result).toEqual({ isDisposable: false, matchedWord: null, digits: null });
    });

    it('returns not-disposable for null (no throw)', () => {
      expect(() => isDisposableHandle(null)).not.toThrow();
      expect(isDisposableHandle(null).isDisposable).toBe(false);
    });

    it('returns not-disposable for undefined (no throw)', () => {
      expect(() => isDisposableHandle(undefined)).not.toThrow();
      expect(isDisposableHandle(undefined).isDisposable).toBe(false);
    });
  });

  describe('digit-bound constants', () => {
    it('exposes the documented 6–8 digit range', () => {
      expect(DISPOSABLE_MIN_DIGITS).toBe(6);
      expect(DISPOSABLE_MAX_DIGITS).toBe(8);
    });
  });
});
