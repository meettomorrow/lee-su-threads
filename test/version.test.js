import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import {
  EXTENSION_VERSION_RE,
  PLACEHOLDER_VERSION,
  isValidExtensionVersion,
  isReleaseVersion,
  normalizeTag,
  incrementVersion,
  getGitVersion,
  _resetGitVersionCache,
} from "../scripts/lib/version.js";

describe("isValidExtensionVersion", () => {
  it("accepts 1–4 dot-separated integers (Chrome MV3)", () => {
    for (const v of ["1", "1.0", "1.0.6", "1.0.6.65535"]) {
      expect(isValidExtensionVersion(v)).toBe(true);
    }
  });

  it("rejects prerelease, non-numeric, and malformed versions", () => {
    for (const v of ["1.0.6-beta.1", "v1.0.6", "1.0.6.7.8", "nightly", "ios-1.0.6", "1..0", ""]) {
      expect(isValidExtensionVersion(v)).toBe(false);
    }
  });

  it("rejects non-strings", () => {
    expect(isValidExtensionVersion(null)).toBe(false);
    expect(isValidExtensionVersion(undefined)).toBe(false);
    expect(isValidExtensionVersion(106)).toBe(false);
  });

  it("the placeholder is not itself a stray valid value we'd ship (it is valid shape but flagged elsewhere)", () => {
    // 0.0.0 is a shape-valid version; the build/guard reject it by identity,
    // not by shape. This documents that distinction.
    expect(EXTENSION_VERSION_RE.test(PLACEHOLDER_VERSION)).toBe(true);
  });
});

describe("isReleaseVersion", () => {
  it("accepts exactly three numeric parts", () => {
    for (const v of ["1.0.6", "0.0.0", "10.20.30"]) expect(isReleaseVersion(v)).toBe(true);
  });

  it("rejects fewer or more than three parts, and prereleases", () => {
    // The deliberate divergence: 1.2.3.4 is a valid manifest version but NOT a
    // valid release tag. Pinning it so a later regex "harmonisation" can't undo it.
    for (const v of ["1.2", "1", "1.2.3.4", "1.2.3-beta.1", "v1.0.6"]) {
      expect(isReleaseVersion(v)).toBe(false);
    }
  });

  it("is stricter than isValidExtensionVersion for a 4-part version", () => {
    expect(isValidExtensionVersion("1.2.3.4")).toBe(true);
    expect(isReleaseVersion("1.2.3.4")).toBe(false);
  });
});

describe("normalizeTag", () => {
  it("strips a leading v", () => {
    expect(normalizeTag("v1.0.6")).toBe("1.0.6");
    expect(normalizeTag("1.0.6")).toBe("1.0.6");
  });

  it("returns null for a prerelease tag that the glob would let through", () => {
    // The git describe --match glob matches "v1.2.3-beta.1"; normalizeTag is
    // the second gate that rejects it. This is the exact hole a prior bug had.
    expect(normalizeTag("v1.2.3-beta.1")).toBeNull();
  });

  it("returns null for non-version tags and empty input", () => {
    for (const t of ["ios-1.0.6", "nightly", "", null, undefined]) {
      expect(normalizeTag(t)).toBeNull();
    }
  });
});

describe("incrementVersion", () => {
  it("bumps the patch component", () => {
    expect(incrementVersion("1.0.6")).toBe("1.0.7");
    expect(incrementVersion("0.0.0")).toBe("0.0.1");
    expect(incrementVersion("1.2.9")).toBe("1.2.10");
  });

  it("preserves leading components", () => {
    expect(incrementVersion("2.5.0")).toBe("2.5.1");
  });

  it("throws on fewer than three components", () => {
    expect(() => incrementVersion("1.0")).toThrow(/Expected semver/);
  });

  it("throws when the patch component is not numeric", () => {
    expect(() => incrementVersion("1.0.x")).toThrow(/Invalid patch version/);
  });
});

describe("getGitVersion", () => {
  const repos = [];

  // Git env scrubbed so the fixture is hermetic: any inherited GIT_* var (DIR,
  // WORK_TREE, INDEX_FILE, OBJECT_DIRECTORY, COMMON_DIR — all set when git runs
  // us from a hook) would redirect these commands at the real repo, and a global
  // commit.gpgsign would make --allow-empty fail. Drop every GIT_* key, then
  // point config at /dev/null.
  const cleanEnv = { ...process.env };
  for (const k of Object.keys(cleanEnv)) if (k.startsWith("GIT_")) delete cleanEnv[k];
  cleanEnv.GIT_CONFIG_GLOBAL = "/dev/null";
  cleanEnv.GIT_CONFIG_SYSTEM = "/dev/null";

  // A throwaway git repo whose newest matching tag is `tag` (or none).
  function repoWithTag(tag) {
    const dir = mkdtempSync(join(tmpdir(), "lst-ver-"));
    repos.push(dir);
    const run = (cmd) => execSync(cmd, { cwd: dir, stdio: "pipe", env: cleanEnv });
    run("git init -q");
    run('git config user.email "t@example.com"');
    run('git config user.name "t"');
    run('git commit -q --allow-empty -m init');
    if (tag) run(`git tag ${tag}`);
    return dir;
  }

  afterEach(() => {
    _resetGitVersionCache();
    while (repos.length) rmSync(repos.pop(), { recursive: true, force: true });
  });

  it("returns the stripped version for a valid tag", () => {
    _resetGitVersionCache();
    expect(getGitVersion({ cwd: repoWithTag("v2.3.4") })).toBe("2.3.4");
  });

  it("returns null for a prerelease tag the glob lets through", () => {
    _resetGitVersionCache();
    expect(getGitVersion({ cwd: repoWithTag("v1.2.3-beta.1") })).toBeNull();
  });

  it("returns null when no matching tag exists", () => {
    _resetGitVersionCache();
    expect(getGitVersion({ cwd: repoWithTag(null) })).toBeNull();
  });

  it("memoizes per cwd — a tag added after the first call is not seen", () => {
    _resetGitVersionCache();
    const dir = repoWithTag("v1.0.0");
    expect(getGitVersion({ cwd: dir })).toBe("1.0.0");
    // Newer tag on a NEW commit so `git describe` deterministically prefers it.
    execSync('git commit -q --allow-empty -m next && git tag v1.0.1', { cwd: dir, stdio: "pipe", env: cleanEnv });
    expect(getGitVersion({ cwd: dir })).toBe("1.0.0"); // cached — new tag not seen
    _resetGitVersionCache();
    expect(getGitVersion({ cwd: dir })).toBe("1.0.1"); // re-read after reset
  });

  it("keys the cache per cwd (distinct repos resolve independently)", () => {
    _resetGitVersionCache();
    const a = repoWithTag("v3.0.0");
    const b = repoWithTag("v4.0.0");
    expect(getGitVersion({ cwd: a })).toBe("3.0.0");
    expect(getGitVersion({ cwd: b })).toBe("4.0.0");
  });
});
