import * as esbuild from 'esbuild';
import { copyFile, mkdir, cp, readFile, writeFile } from 'fs/promises';
import { execSync } from 'child_process';

const isWatch = process.argv.includes('--watch');
const isDev = isWatch || process.env.NODE_ENV === 'development';

// Build configuration for Firefox variants
const FIREFOX_BUILD_TYPE = process.env.FIREFOX_BUILD_TYPE; // 'amo' or 'self-hosted'

// Get version from git tags (supports both annotated and lightweight tags)
// Placeholder written in src/manifest*.json — the real version is injected at
// build time from the git tag. Must never reach a shipped artifact.
const PLACEHOLDER_VERSION = '0.0.0';

// A Chrome MV3 version: 1–4 dot-separated integers.
const SEMVER_RE = /^\d+(\.\d+){1,3}$/;

let cachedGitVersion;

// Latest semver-shaped git tag (e.g. "v1.0.6" -> "1.0.6"), or null when none.
// Memoized so every manifest in one build agrees and we spawn `git` once.
function getGitVersion() {
  if (cachedGitVersion === undefined) cachedGitVersion = computeGitVersion();
  return cachedGitVersion;
}

function computeGitVersion() {
  let tag;
  try {
    // --match restricts to version tags, so a stray tag like "ios-1.0.6" or
    // "nightly" is never picked up as the version.
    tag = execSync("git describe --tags --abbrev=0 --match='v[0-9]*.[0-9]*.[0-9]*'", {
      encoding: 'utf-8',
    }).trim();
  } catch (error) {
    const errorMessage = error.message || String(error);
    if (/No names found|No tags|cannot describe/.test(errorMessage)) {
      console.warn('⚠️  No matching git version tag found; falling back to manifest version');
    } else {
      console.warn('⚠️  Could not get git version:', errorMessage.split('\n')[0]);
    }
    return null;
  }
  // Remove 'v' prefix if present, then validate — a prerelease tag like
  // "v1.1.0-beta.1" passes the glob but is not a valid manifest version.
  const version = tag.startsWith('v') ? tag.slice(1) : tag;
  if (!SEMVER_RE.test(version)) {
    console.warn(`⚠️  Ignoring non-semver git tag "${tag}"`);
    return null;
  }
  return version;
}

// Increment the patch version (e.g., "0.3.7" -> "0.3.8")
function incrementVersion(version) {
  const parts = version.split('.');
  if (parts.length < 3) {
    throw new Error(`Invalid version format "${version}". Expected semver format (X.Y.Z)`);
  }

  const patchNum = Number(parts[2]);
  if (isNaN(patchNum)) {
    throw new Error(`Invalid patch version "${parts[2]}" in version "${version}". Must be a number`);
  }

  parts[2] = String(patchNum + 1);
  return parts.join('.');
}

// Resolve the version to write into a built manifest.
//
// Single source of truth is the latest git tag (e.g. "v1.0.6"):
//   - Production builds use the tag verbatim  → shipped version === git tag
//   - Dev/watch builds use tag + 1            → a "next version" preview
//
// The `version` field in src/manifest*.json is NOT a source of truth; it is
// only a fallback for when no git tag is reachable (e.g. a shallow CI checkout
// without tags, where release.yml has already injected the tag via jq).
function resolveManifestVersion(manifestVersion, label) {
  const gitVersion = getGitVersion();
  const base = gitVersion || manifestVersion;

  // Never ship the placeholder. In production, a missing tag means the version
  // is unknown — fail loudly rather than writing 0.0.0 into a store artifact.
  // Dev/watch is allowed through (0.0.1) so a tagless clone stays buildable.
  if (!isDev && base === PLACEHOLDER_VERSION) {
    throw new Error(
      `Cannot resolve a real version for "${label}": no semver git tag is reachable ` +
      `and src/manifest is the ${PLACEHOLDER_VERSION} placeholder. ` +
      `Run "git fetch --tags" (or tag the release) before a production build.`,
    );
  }

  const version = isDev ? incrementVersion(base) : base;
  const source = gitVersion ? `git tag ${gitVersion}` : `manifest ${manifestVersion} (no git tag)`;
  const arrow = version === base ? '' : ` → ${version}`;
  console.log(`📦 ${label}: ${isDev ? 'Dev' : 'Prod'} build using ${source}${arrow}`);
  return version;
}

// Build JavaScript bundles (shared between Chrome and Firefox)
const buildOptions = {
  entryPoints: [
    'src/content.js',
    'src/popup.js',
    'src/background.js',
    'src/injected.js',
    'src/onboarding.js',
  ],
  bundle: true,
  outdir: 'dist/shared',
  format: 'iife',
  target: ['chrome90', 'firefox90'],
  sourcemap: true,
  minify: !isWatch,
};

// Copy static files to a specific browser directory
async function copyStaticFilesForBrowser(browser) {
  // Determine Firefox-specific build configuration
  let distDir = `dist/${browser}`;

  if (browser === 'firefox' && FIREFOX_BUILD_TYPE) {
    if (FIREFOX_BUILD_TYPE === 'amo') {
      distDir = 'dist/firefox-amo';
      console.log('🦊 Building Firefox AMO variant → dist/firefox-amo');
    } else if (FIREFOX_BUILD_TYPE === 'self-hosted') {
      distDir = 'dist/firefox-direct';
      console.log('🦊 Building Firefox Direct Install variant → dist/firefox-direct');
    }
  }

  // Ensure browser-specific dist directory exists
  await mkdir(distDir, { recursive: true });

  // Copy bundled JS files from shared directory
  await copyFile('dist/shared/content.js', `${distDir}/content.js`);
  await copyFile('dist/shared/popup.js', `${distDir}/popup.js`);
  await copyFile('dist/shared/background.js', `${distDir}/background.js`);
  await copyFile('dist/shared/injected.js', `${distDir}/injected.js`);
  await copyFile('dist/shared/onboarding.js', `${distDir}/onboarding.js`);

  if (!isWatch) {
    // Copy source maps in production builds
    await copyFile('dist/shared/content.js.map', `${distDir}/content.js.map`).catch(() => {});
    await copyFile('dist/shared/popup.js.map', `${distDir}/popup.js.map`).catch(() => {});
    await copyFile('dist/shared/background.js.map', `${distDir}/background.js.map`).catch(() => {});
    await copyFile('dist/shared/injected.js.map', `${distDir}/injected.js.map`).catch(() => {});
  }

  // Copy appropriate manifest (rename to manifest.json for both)
  let sourceManifest;
  if (browser === 'chrome') {
    sourceManifest = 'src/manifest.json';
  } else if (browser === 'firefox' && FIREFOX_BUILD_TYPE === 'self-hosted') {
    sourceManifest = 'src/manifest.firefox-direct.json';
  } else {
    sourceManifest = 'src/manifest.firefox.json';
  }

  const manifestContent = await readFile(sourceManifest, 'utf-8');
  const manifest = JSON.parse(manifestContent);

  manifest.version = resolveManifestVersion(manifest.version, browser);

  await writeFile(`${distDir}/manifest.json`, JSON.stringify(manifest, null, 2));

  // Copy HTML and CSS
  await copyFile('src/popup.html', `${distDir}/popup.html`);
  await copyFile('src/onboarding.html', `${distDir}/onboarding.html`);
  await copyFile('src/styles.css', `${distDir}/styles.css`);

  // Copy _locales directory recursively
  await cp('_locales', `${distDir}/_locales`, { recursive: true });

  // Copy icons directory
  await cp('icons', `${distDir}/icons`, { recursive: true });

  // Copy fonts directory
  await cp('fonts', `${distDir}/fonts`, { recursive: true });
}

// Copy static files for Safari (similar to Chrome/Firefox but uses safari manifest)
async function copyStaticFilesForSafari() {
  const distDir = 'dist/safari';

  // Ensure Safari dist directory exists
  await mkdir(distDir, { recursive: true });

  // Copy bundled JS files from shared directory
  await copyFile('dist/shared/content.js', `${distDir}/content.js`);
  await copyFile('dist/shared/popup.js', `${distDir}/popup.js`);
  await copyFile('dist/shared/background.js', `${distDir}/background.js`);
  await copyFile('dist/shared/injected.js', `${distDir}/injected.js`);
  await copyFile('dist/shared/onboarding.js', `${distDir}/onboarding.js`);

  if (!isWatch) {
    // Copy source maps in production builds
    await copyFile('dist/shared/content.js.map', `${distDir}/content.js.map`).catch(() => {});
    await copyFile('dist/shared/popup.js.map', `${distDir}/popup.js.map`).catch(() => {});
    await copyFile('dist/shared/background.js.map', `${distDir}/background.js.map`).catch(() => {});
    await copyFile('dist/shared/injected.js.map', `${distDir}/injected.js.map`).catch(() => {});
  }

  // Copy Safari manifest
  const manifestContent = await readFile('src/manifest.safari.json', 'utf-8');
  const manifest = JSON.parse(manifestContent);

  manifest.version = resolveManifestVersion(manifest.version, 'safari');

  await writeFile(`${distDir}/manifest.json`, JSON.stringify(manifest, null, 2));

  // Copy HTML and CSS
  await copyFile('src/popup.html', `${distDir}/popup.html`);
  await copyFile('src/onboarding.html', `${distDir}/onboarding.html`);
  await copyFile('src/styles.css', `${distDir}/styles.css`);

  // Copy _locales directory recursively
  await cp('_locales', `${distDir}/_locales`, { recursive: true });

  // Replace extension name for Safari (Apple requires different name)
  const locales = ['en', 'zh_TW', 'zh_CN', 'ja', 'ko'];
  for (const locale of locales) {
    const messagesPath = `${distDir}/_locales/${locale}/messages.json`;
    try {
      let content = await readFile(messagesPath, 'utf-8');
      // Replace all occurrences of "Lee-Su-Threads" with "Lee-Su-Sui"
      content = content.replaceAll('Lee-Su-Threads', 'Lee-Su-Sui');
      await writeFile(messagesPath, content);
    } catch (error) {
      // Skip if locale file doesn't exist
    }
  }

  // Copy icons directory
  await cp('icons', `${distDir}/icons`, { recursive: true });

  // Copy fonts directory
  await cp('fonts', `${distDir}/fonts`, { recursive: true });
}

async function copyStaticFiles() {
  // Build for Chrome, Firefox, and Safari
  await copyStaticFilesForBrowser('chrome');
  await copyStaticFilesForBrowser('firefox');
  await copyStaticFilesForSafari();

  console.log('✓ Static files copied to dist/chrome, dist/firefox-*, and dist/safari');
}

async function build() {
  try {
    // First, build the JavaScript bundles to dist/shared
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      // Perform initial build before starting watch mode
      await ctx.rebuild();
      console.log('✓ Initial build complete');
      // Copy static files after initial build completes
      await copyStaticFiles();
      // Now start watching for changes
      await ctx.watch();
      console.log('👀 Watching for changes...');
    } else {
      await esbuild.build(buildOptions);
      console.log('✓ JavaScript bundles built');
      // Then copy static files and organize into browser-specific directories
      await copyStaticFiles();
      console.log('✓ Build complete');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
