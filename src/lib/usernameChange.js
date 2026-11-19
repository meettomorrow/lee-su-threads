/**
 * Username-change detection (改名判定)
 *
 * Threads' "About this profile" sheet has a "Former usernames" row whose value
 * is a localized summary such as:
 *   "在 Threads 變更過 1 次"      (zh_TW)
 *   "Instagramで1回変更"          (ja)
 *   "Changed 1 time on Threads"  (en)
 *
 * Only the platform and the number of changes are exposed — never the former
 * usernames themselves — so that is all we keep.
 *
 * Pure, side-effect free: no DOM, no browserAPI. Safe to unit-test directly.
 */

/**
 * Parse the value of the "Former usernames" row.
 *
 * @param {string} value - Localized summary text from the profile sheet.
 * @returns {{ raw: string, count: number|null, platform: 'threads'|'instagram'|null }|null}
 *   null when there is no value. `count` / `platform` are null when the text
 *   does not contain them in a recognizable form; `raw` is always kept.
 */
export function parseFormerUsernames(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  const digits = raw.match(/\d+/);
  const count = digits ? parseInt(digits[0], 10) : null;

  let platform = null;
  if (/threads/i.test(raw)) {
    platform = 'threads';
  } else if (/instagram/i.test(raw)) {
    platform = 'instagram';
  }

  return { raw, count, platform };
}

/**
 * Whether a profile should carry the username-change tag. Threads only shows
 * the "Former usernames" row for accounts that changed it, so the row being
 * present counts even if no number could be read from it.
 *
 * @param {Object} profileInfo
 * @returns {boolean}
 */
export function hasUsernameChange(profileInfo) {
  const former = profileInfo?.formerUsernames;
  if (!former || typeof former !== 'object') return false;
  return former.count === null || former.count >= 1;
}
