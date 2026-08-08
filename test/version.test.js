import { describe, it, expect } from "vitest";
import {
  EXTENSION_VERSION_RE,
  PLACEHOLDER_VERSION,
  isValidExtensionVersion,
  normalizeTag,
  incrementVersion,
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
