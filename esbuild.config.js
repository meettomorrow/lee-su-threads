import * as esbuild from 'esbuild';
import { copyFile, mkdir, cp, readFile, writeFile } from 'fs/promises';
import { execSync } from 'child_process';

const isWatch = process.argv.includes('--watch');
const isDev = isWatch || process.env.NODE_ENV === 'development';

// Build configuration for Firefox variants
const FIREFOX_BUILD_TYPE = process.env.FIREFOX_BUILD_TYPE; // 'amo' or 'self-hosted'

// Get version from git tags (supports both annotated and lightweight tags)
function getGitVersion() {
  try {
    // Get the latest git tag (e.g., "v0.3.7" or "0.3.7")
    const tag = execSync('git describe --tags --abbrev=0', { encoding: 'utf-8' }).trim();
    // Remove 'v' prefix if present
    return tag.startsWith('v') ? tag.slice(1) : tag;
  } catch (error) {
    const errorMessage = error.message || String(error);
    if (errorMessage.includes('No names found') || errorMessage.includes('No tags')) {
      console.warn('⚠️  No git tags found, using manifest version for dev build');
    } else {
      console.warn('⚠️  Could not get git version:', errorMessage.split('\n')[0]);
    }
    return null;
  }
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

  // In development, use git tag version + 1 (e.g., "0.3.7" -> "0.3.8")
  if (isDev) {
    const gitVersion = getGitVersion();
    if (gitVersion) {
      const newVersion = incrementVersion(gitVersion);
      console.log(`📦 ${browser}: Dev build using git tag ${gitVersion} → ${newVersion}`);
      manifest.version = newVersion;
    } else {
      const oldVersion = manifest.version;
      const newVersion = incrementVersion(oldVersion);
      console.log(`📦 ${browser}: Dev build using manifest version ${oldVersion} → ${newVersion}`);
      manifest.version = newVersion;
    }
  }

  await writeFile(`${distDir}/manifest.json`, JSON.stringify(manifest, null, 2));

  // Copy HTML and CSS
  await copyFile('src/popup.html', `${distDir}/popup.html`);
  await copyFile('src/onboarding.html', `${distDir}/onboarding.html`);
  await copyFile('src/styles.css', `${distDir}/styles.css`);

  // Copy _locales directory recursively
  await cp('_locales', `${distDir}/_locales`, { recursive: true });

  // Copy icons directory
  await cp('icons', `${distDir}/icons`, { recursive: true });
}

async function copyStaticFiles() {
  // Build for both Chrome and Firefox
  await copyStaticFilesForBrowser('chrome');
  await copyStaticFilesForBrowser('firefox');

  console.log('✓ Static files copied to dist/chrome and dist/firefox-*');
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
