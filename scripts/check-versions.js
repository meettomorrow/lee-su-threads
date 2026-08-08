#!/usr/bin/env node
// Verify every version source agrees with the latest git tag.
//
// The git tag is the single source of truth. This guard fails the run when
// anything drifts from it — run it before a release / Safari archive, or in
// CI after building.
//
//   node scripts/check-versions.js          # full check (use before a Safari archive)
//   node scripts/check-versions.js --web     # web artifacts only (skip MARKETING_VERSION)
//   npm run check:versions
//
// Sources checked (each only when present):
//   - Xcode MARKETING_VERSION in the Safari project's project.pbxproj
//   - built dist/*/manifest.json (skipped if not built yet)
//
// --web skips MARKETING_VERSION: a web-only (Chrome/Firefox) release legitimately
// leaves the Safari app version lagging, so package.sh uses --web to avoid failing
// on that. A human cutting a Safari release runs the full check.
//
// Note: this is a release gate. A dev/watch build writes tag+1 into dist, so it
// will (correctly) report a mismatch — run it against a production build.
//
// Not checked, by design: src/manifest*.json (a 0.0.0 placeholder the build
// overwrites from the tag) and package.json's version (npm-local metadata, not
// read by the build and not shipped in any artifact).

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getGitVersion, PLACEHOLDER_VERSION } from "./lib/version.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Shared with the build (scripts/lib/version.js): same glob AND the same semver
// validation, so a tag the build would reject (e.g. a prerelease) can't slip
// past the guard by comparing an invalid version against itself.
function getTag() {
  return getGitVersion({ cwd: root });
}

function getMarketingVersions() {
  const pbxproj = join(
    root,
    "dist-safari/safari-project/Lee-Su-Sui/Lee-Su-Sui.xcodeproj/project.pbxproj",
  );
  if (!existsSync(pbxproj)) return null;
  const content = readFileSync(pbxproj, "utf-8");
  const versions = [...content.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) =>
    // pbxproj values may be quoted (MARKETING_VERSION = "1.0.6";) — strip them.
    m[1].trim().replace(/^"|"$/g, ""),
  );
  return [...new Set(versions)];
}

function getManifestVersion(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")).version;
}

const webOnly = process.argv.includes("--web");

const tag = getTag();
const rows = [["git tag (source of truth)", tag ?? "(none reachable)"]];
const problems = [];

// Xcode MARKETING_VERSION (the hand-edited value that drifted before).
const mv = webOnly ? null : getMarketingVersions();
if (webOnly) {
  rows.push(["Xcode MARKETING_VERSION", "(--web: skipped)"]);
} else if (mv === null) {
  rows.push(["Xcode MARKETING_VERSION", "(project not found — skipped)"]);
} else if (mv.length === 0) {
  rows.push(["Xcode MARKETING_VERSION", "(none found — skipped)"]);
} else {
  rows.push(["Xcode MARKETING_VERSION", mv.join(", ")]);
  if (mv.length > 1) {
    problems.push(`MARKETING_VERSION is inconsistent across build configs: ${mv.join(", ")}`);
  } else if (mv[0] === PLACEHOLDER_VERSION) {
    problems.push(`MARKETING_VERSION is the ${PLACEHOLDER_VERSION} placeholder — run: bash scripts/set-safari-version.sh <version>`);
  } else if (tag && mv[0] !== tag) {
    problems.push(
      `MARKETING_VERSION (${mv[0]}) != git tag (${tag}). Run: bash scripts/set-safari-version.sh ${tag}`,
    );
  }
}

// Built dist manifests (present only after a build).
for (const rel of [
  "dist/chrome/manifest.json",
  "dist/firefox/manifest.json",
  "dist/firefox-amo/manifest.json",
  "dist/firefox-direct/manifest.json",
  "dist/safari/manifest.json",
]) {
  const v = getManifestVersion(rel);
  if (v == null) continue;
  rows.push([rel, v]);
  // A placeholder in a built manifest is always wrong — the build could not
  // resolve a real version. Flag it even when no tag is reachable, since that
  // is exactly the state that produces a bad 0.0.0 artifact.
  if (v === PLACEHOLDER_VERSION) {
    problems.push(`${rel} is the ${PLACEHOLDER_VERSION} placeholder — the build could not resolve a version. Run "git fetch --tags" and rebuild.`);
  } else if (tag && v !== tag) {
    problems.push(
      `${rel} (${v}) != git tag (${tag}). Rebuild with the tag checked out, or run "npm run clean" to clear a stale build.`,
    );
  }
}

const width = Math.max(...rows.map((r) => r[0].length));
console.log("\nVersion check:");
for (const [k, v] of rows) console.log(`  ${k.padEnd(width)}  ${v}`);
console.log("");

// With no tag we can't verify against the source of truth. If nothing else is
// obviously broken, still fail — an unverifiable release is not a passing one.
if (!tag && problems.length === 0) {
  console.error("⚠️  No semver git tag reachable — cannot verify versions against the source of truth.");
  console.error('   Tag the release (git tag vX.Y.Z) or run "git fetch --tags".');
  process.exit(1);
}

if (problems.length) {
  console.error("❌ Version check failed:");
  for (const p of problems) console.error(`   - ${p}`);
  process.exit(1);
}

console.log("✅ All present version sources match the git tag.");
