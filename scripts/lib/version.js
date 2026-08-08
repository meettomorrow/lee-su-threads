// Single source of truth for how a version is derived and validated.
//
// The build (esbuild.config.js) and the release guard (check-versions.js) both
// import from here so the rules can't drift apart. Two callers can't import it
// and keep their own copy on purpose: set-safari-version.sh (bash) and
// .github/workflows/release.yml both validate the release tag as exactly 3
// parts — deliberately stricter than EXTENSION_VERSION_RE (Chrome MV3 allows 4,
// the App Store allows 3). Keep those in sync with RELEASE_VERSION_RE below.

import { execSync } from "node:child_process";

// Placeholder written in src/manifest*.json — the real version is injected at
// build time from the git tag and must never reach a shipped artifact.
export const PLACEHOLDER_VERSION = "0.0.0";

// git describe glob that pre-filters to version tags. This is a GLOB, not a
// regex ('*' matches anything, including "-beta.1"), so it only narrows the
// candidates — every result must still pass EXTENSION_VERSION_RE below.
export const VERSION_TAG_GLOB = "v[0-9]*.[0-9]*.[0-9]*";

// A valid Chrome MV3 version: 1–4 dot-separated integers. Authoritative for
// anything written into a web extension manifest. (In practice the git-tag
// glob only yields 3+ part versions; this stays faithful to the spec anyway.)
export const EXTENSION_VERSION_RE = /^\d+(\.\d+){0,3}$/;

export function isValidExtensionVersion(version) {
  return typeof version === "string" && EXTENSION_VERSION_RE.test(version);
}

// A release tag is exactly X.Y.Z — stricter than a manifest version (App Store
// MARKETING_VERSION allows at most 3 parts), and what release.yml enforces on
// the pushed tag. EXTENSION_VERSION_RE stays the looser "what a manifest holds".
export const RELEASE_VERSION_RE = /^\d+\.\d+\.\d+$/;

export function isReleaseVersion(version) {
  return typeof version === "string" && RELEASE_VERSION_RE.test(version);
}

// Turn a raw `git describe` tag ("v1.0.6", "1.0.6", "v1.2.3-beta.1", …) into a
// valid extension version, or null. Pure — the unit tests exercise this so the
// glob/regex divergence that caused past bugs is caught without touching git.
export function normalizeTag(tag) {
  if (!tag) return null;
  const version = tag.startsWith("v") ? tag.slice(1) : tag;
  return isValidExtensionVersion(version) ? version : null;
}

// Memoized per cwd so distinct working directories don't share a result and
// repeated calls in one build spawn `git` once.
const gitVersionCache = new Map();

// Latest valid version from git tags (e.g. "v1.0.6" -> "1.0.6"), or null when
// none is reachable or the newest matching tag isn't a valid extension version
// (e.g. a prerelease tag).
export function getGitVersion({ cwd } = {}) {
  const key = cwd ?? "";
  if (!gitVersionCache.has(key)) gitVersionCache.set(key, computeGitVersion(cwd));
  return gitVersionCache.get(key);
}

function computeGitVersion(cwd) {
  let tag;
  try {
    tag = execSync(`git describe --tags --abbrev=0 --match='${VERSION_TAG_GLOB}'`, {
      cwd,
      encoding: "utf-8",
    }).trim();
  } catch (error) {
    const message = error.message || String(error);
    if (/No names found|No tags|cannot describe/.test(message)) {
      // Neutral wording: this module is shared, and not every caller has a
      // manifest fallback (check-versions.js does not).
      console.warn("⚠️  No matching git version tag found");
    } else {
      console.warn("⚠️  Could not get git version:", message.split("\n")[0]);
    }
    return null;
  }
  const version = normalizeTag(tag);
  if (version === null) console.warn(`⚠️  Ignoring non-semver git tag "${tag}"`);
  return version;
}

// Reset the memoized value (unit tests only).
export function _resetGitVersionCache() {
  gitVersionCache.clear();
}

// Increment the patch version (e.g., "0.3.7" -> "0.3.8").
export function incrementVersion(version) {
  const parts = version.split(".");
  if (parts.length < 3) {
    throw new Error(`Invalid version format "${version}". Expected semver format (X.Y.Z)`);
  }
  const patchNum = Number(parts[2]);
  if (isNaN(patchNum)) {
    throw new Error(`Invalid patch version "${parts[2]}" in version "${version}". Must be a number`);
  }
  parts[2] = String(patchNum + 1);
  return parts.join(".");
}
