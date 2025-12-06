import * as esbuild from 'esbuild';
import { copyFile, mkdir, cp } from 'fs/promises';
import { existsSync } from 'fs';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: [
    'src/content.js',
    'src/popup.js',
    'src/background.js',
    'src/injected.js',
  ],
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  target: ['chrome90', 'firefox90'],
  sourcemap: true,
  minify: !isWatch,
};

// Copy static files that don't need bundling
async function copyStaticFiles() {
  // Ensure dist directory exists
  if (!existsSync('dist')) {
    await mkdir('dist', { recursive: true });
  }

  // Copy manifest files
  await copyFile('src/manifest.json', 'dist/manifest.json');
  await copyFile('src/manifest.firefox.json', 'dist/manifest.firefox.json');

  // Copy HTML and CSS
  await copyFile('src/popup.html', 'dist/popup.html');
  await copyFile('src/styles.css', 'dist/styles.css');

  // Copy _locales directory recursively
  await cp('_locales', 'dist/_locales', { recursive: true });

  // Copy icons directory
  await cp('icons', 'dist/icons', { recursive: true });

  console.log('✓ Static files copied');
}

async function build() {
  try {
    await copyStaticFiles();

    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log('👀 Watching for changes...');
    } else {
      await esbuild.build(buildOptions);
      console.log('✓ Build complete');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
