import * as esbuild from 'esbuild';
import { copyFile, mkdir, cp } from 'fs/promises';

const isWatch = process.argv.includes('--watch');

// Build JavaScript bundles (shared between Chrome and Firefox)
const buildOptions = {
  entryPoints: [
    'src/content.js',
    'src/popup.js',
    'src/background.js',
    'src/injected.js',
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
  const distDir = `dist/${browser}`;

  // Ensure browser-specific dist directory exists
  await mkdir(distDir, { recursive: true });

  // Copy bundled JS files from shared directory
  await copyFile('dist/shared/content.js', `${distDir}/content.js`);
  await copyFile('dist/shared/popup.js', `${distDir}/popup.js`);
  await copyFile('dist/shared/background.js', `${distDir}/background.js`);
  await copyFile('dist/shared/injected.js', `${distDir}/injected.js`);

  if (!isWatch) {
    // Copy source maps in production builds
    await copyFile('dist/shared/content.js.map', `${distDir}/content.js.map`).catch(() => {});
    await copyFile('dist/shared/popup.js.map', `${distDir}/popup.js.map`).catch(() => {});
    await copyFile('dist/shared/background.js.map', `${distDir}/background.js.map`).catch(() => {});
    await copyFile('dist/shared/injected.js.map', `${distDir}/injected.js.map`).catch(() => {});
  }

  // Copy appropriate manifest (rename to manifest.json for both)
  if (browser === 'chrome') {
    await copyFile('src/manifest.json', `${distDir}/manifest.json`);
  } else if (browser === 'firefox') {
    await copyFile('src/manifest.firefox.json', `${distDir}/manifest.json`);
  }

  // Copy HTML and CSS
  await copyFile('src/popup.html', `${distDir}/popup.html`);
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

  console.log('✓ Static files copied to dist/chrome and dist/firefox');
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
