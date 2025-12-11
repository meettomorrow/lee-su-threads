# Contributing to Lee-Su-Threads

Thank you for your interest in contributing! This guide covers the development workflow and release process.

## Development Setup

1. Clone the repository
2. Run `npm install`
3. Run `npm run build` to build both Chrome and Firefox versions
4. Load the extension:
   - **Chrome**: Navigate to `chrome://extensions/`, enable Developer mode, click "Load unpacked", select `dist/chrome/`
   - **Firefox**: Navigate to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", select `dist/firefox-direct/manifest.json`

## Testing

```bash
npm test              # Run tests once
npm run test:watch    # Run tests in watch mode
```

## Version Management

**During development, DO NOT update version numbers in `src/manifest.json` or `src/manifest.firefox.json`.**

The build system automatically handles versioning:
- **Development builds** (`npm run build:watch`): Auto-increments version from latest git tag (e.g., `v0.3.7` → `0.3.8`)
- **Production builds** (`npm run build`): Uses exact version from source manifests
- **Only update manifest versions when creating a release** (see Release Process below)

## Release Process

### Firefox Distribution Setup

This repository supports two separate Firefox add-ons with different distribution channels:

#### 1. AMO Add-on (`lee-su-threads@meetandy.ai`)
- **Add-on ID:** `lee-su-threads@meetandy.ai`
- **Manifest:** `src/manifest.firefox.json` (no `update_url`)
- **Package:** `lee-su-threads-firefox-v{version}-amo.zip`
- **Purpose:** Submit to AMO for unlisted/listed review
- **Process:** Manual submission to https://addons.mozilla.org/developers/

#### 2. Direct Install Add-on (`lee-su-threads-direct@meetandy.ai`)
- **Add-on ID:** `lee-su-threads-direct@meetandy.ai` (different from AMO)
- **Manifest:** `src/manifest.firefox-direct.json` (with `update_url`)
- **Package:** `lee-su-threads-firefox-v{version}-direct-install.xpi` (signed)
- **Purpose:** Self-hosted distribution with auto-updates
- **Process:** Automatically signed via Mozilla API in CI

**Key difference:** Both use the same version number (e.g., `0.3.8`), but have different add-on IDs so they're treated as completely separate extensions by Firefox.

#### Setting up Firefox API Credentials

To enable automatic signing for direct install builds:

1. Go to https://addons.mozilla.org/developers/addon/api/key/
2. Generate new API credentials
3. Add to GitHub repository:
   - **Secrets:**
     - `FIREFOX_API_KEY` (format: `user:{user_id}:{key_id}`)
     - `FIREFOX_API_SECRET`
   - **Variables:**
     - `ENABLE_FIREFOX_SIGNING` = `true`

#### How the Release Workflow Works

When you push a version tag (e.g., `v0.3.8`):

**With `ENABLE_FIREFOX_SIGNING=true` (main repository):**
1. Updates all manifests to version `0.3.8`
2. Builds three versions:
   - **Chrome:** Standard build
   - **Firefox AMO:** `lee-su-threads@meetandy.ai` (no `update_url`)
   - **Firefox Direct:** `lee-su-threads-direct@meetandy.ai` (with `update_url`)
3. Signs direct install version with `--channel=unlisted`
4. Creates GitHub Release with:
   - `lee-su-threads-chrome-v0.3.8.zip` (for Chrome Web Store)
   - `lee-su-threads-firefox-v0.3.8-amo.zip` (for AMO submission)
   - `lee-su-threads-firefox-v0.3.8-direct-install.xpi` (signed, self-hosted)
   - `updates.json` (update manifest for direct install add-on)

**With `ENABLE_FIREFOX_SIGNING=false` (forks):**
1. Builds Chrome and Firefox AMO version only
2. Creates GitHub Release with:
   - `lee-su-threads-chrome-v0.3.8.zip`
   - `lee-su-threads-firefox-v0.3.8-amo.zip`

### Creating a Release

**Note:** Version numbers are managed by CI. Only update manifests when creating a release.

1. Create and push a version tag (CI will update manifests automatically):
   ```bash
   git tag v0.3.8
   git push origin v0.3.8
   ```
2. GitHub Actions will automatically:
   - Update all manifest versions to `0.3.8`
   - Build Chrome and both Firefox variants
   - Sign the direct install Firefox extension (if credentials configured)
   - Create a GitHub Release with all packages

### Installing Direct Install Firefox Extension

Users can install the direct install Firefox extension (with auto-updates) from:
```
https://github.com/meettomorrow/lee-su-threads/releases/latest/download/lee-su-threads-firefox-v{version}-direct-install.xpi
```

Firefox will automatically check for updates via the `updates.json` manifest.

### Distribution Channels Summary

- **Chrome Web Store**: Manual upload of unsigned `.zip`
- **Firefox AMO**: Manual submission of `-amo.zip` (add-on ID: `lee-su-threads@meetandy.ai`)
- **Firefox Direct Install**: Auto-signed `-direct-install.xpi` with auto-updates (add-on ID: `lee-su-threads-direct@meetandy.ai`)

## Questions?

If you have questions about the release process or need help setting up credentials, please open an issue.
