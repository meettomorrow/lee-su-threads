/**
 * Disposable-handle detection (免洗帳號判定)
 *
 * Threads/Meta assigns a fixed default username when a user does not set one
 * during sign-up: an English animal word + a half-width dot + 6–8 digits,
 * e.g. `camel.253044`, `leopard.7241883`.
 *
 * This module ONLY matches that exact system-assigned format. Names that merely
 * "look bot-like" (e.g. `leopard1234`, `otter_88213`, `sunny.travel2847`) are
 * user-chosen and are deliberately NOT matched — we would rather miss than
 * over-flag, because the label only means "this handle was never changed from
 * the system default", not "this is a bot / fake / AI account".
 *
 * Pure, side-effect free: no DOM, no browserAPI. Safe to unit-test directly.
 */

import handleWords from '../../data/handle-words.json';

// Digit-count bounds of the system default format. Named so they can be
// adjusted in one place if a new form is observed in the wild.
export const DISPOSABLE_MIN_DIGITS = 6;
export const DISPOSABLE_MAX_DIGITS = 8;

// Animal dictionary, lower-cased into a Set for O(1) full-word lookup.
const ANIMAL_WORDS = new Set(
  (handleWords.animals || []).map((word) => String(word).toLowerCase())
);

// ^<letters>.<digits>$ — the letters part must be a COMPLETE match against the
// dictionary (the regex captures the whole run of letters before the dot, so a
// substring like `cat` in `catherine` can never match), the separator must be a
// half-width dot, and the digits must run to the very end of the string.
const HANDLE_PATTERN = new RegExp(
  `^([a-z]+)\\.(\\d{${DISPOSABLE_MIN_DIGITS},${DISPOSABLE_MAX_DIGITS}})$`
);

/**
 * Determine whether a username is a Threads system-assigned, never-modified
 * default handle.
 *
 * @param {string} username - The handle without the leading "@".
 * @returns {{ isDisposable: boolean, matchedWord: string|null, digits: string|null }}
 */
export function isDisposableHandle(username) {
  const result = { isDisposable: false, matchedWord: null, digits: null };

  if (typeof username !== 'string' || username.length === 0) {
    return result;
  }

  const match = username.toLowerCase().match(HANDLE_PATTERN);
  if (!match) {
    return result;
  }

  const [, word, digits] = match;
  if (!ANIMAL_WORDS.has(word)) {
    return result;
  }

  result.isDisposable = true;
  result.matchedWord = word;
  result.digits = digits;
  return result;
}
