#!/usr/bin/env node
// Verify every version source agrees with the latest git tag.
//
// The git tag is the single source of truth. This guard fails the run when
// anything drifts from it — run it before a release / Safari archive, or in
// CI after building.
//
//   node scripts/check-versions.js
//   npm run check:versions
//
// Sources checked (each only when present):
//   - Xcode MARKETING_VERSION in the Safari project's project.pbxproj
//   - built dist/*/manifest.json (skipped if not built yet)
//
// Note: src/manifest*.json is intentionally NOT checked — its version is a
// 0.0.0 placeholder that the build overwrites from the git tag.

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function getTag() {
  try {
    return execSync("git describe --tags --abbrev=0", { cwd: root, encoding: "utf-8" })
      .trim()
      .replace(/^v/, "");
  } catch {
    return null;
  }
}

function getMarketingVersions() {
  const pbxproj = join(
    root,
    "dist-safari/safari-project/Lee-Su-Sui/Lee-Su-Sui.xcodeproj/project.pbxproj",
  );
  if (!existsSync(pbxproj)) return null;
  const content = readFileSync(pbxproj, "utf-8");
  const versions = [...content.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) =>
    m[1].trim(),
  );
  return [...new Set(versions)];
}

function getManifestVersion(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")).version;
}

const tag = getTag();
if (!tag) {
  console.error("❌ No git tag found. Tag the release first (git tag vX.Y.Z).");
  process.exit(1);
}

const rows = [["git tag (source of truth)", tag]];
const problems = [];

// Xcode MARKETING_VERSION (the hand-edited value that drifted before).
const mv = getMarketingVersions();
if (mv === null) {
  rows.push(["Xcode MARKETING_VERSION", "(project not found — skipped)"]);
} else if (mv.length === 0) {
  rows.push(["Xcode MARKETING_VERSION", "(none found — skipped)"]);
} else {
  rows.push(["Xcode MARKETING_VERSION", mv.join(", ")]);
  if (mv.length > 1) {
    problems.push(`MARKETING_VERSION is inconsistent across build configs: ${mv.join(", ")}`);
  } else if (mv[0] !== tag) {
    problems.push(
      `MARKETING_VERSION (${mv[0]}) != git tag (${tag}). Run: bash scripts/set-safari-version.sh`,
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
  if (v !== tag) {
    problems.push(`${rel} (${v}) != git tag (${tag}). Rebuild with the tag checked out.`);
  }
}

const width = Math.max(...rows.map((r) => r[0].length));
console.log("\nVersion check:");
for (const [k, v] of rows) console.log(`  ${k.padEnd(width)}  ${v}`);
console.log("");

if (problems.length) {
  console.error("❌ Version mismatch:");
  for (const p of problems) console.error(`   - ${p}`);
  process.exit(1);
}

console.log("✅ All present version sources match the git tag.");
