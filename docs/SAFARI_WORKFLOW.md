# Safari Development Workflow

## One-Time Setup

```bash
# 1. First time only - create Xcode project
npm run setup:safari

# 2. Open Xcode
npm run open:safari

# 3. In Xcode: Configure signing (one time)
# - Select each target (iOS and macOS)
# - Signing & Capabilities → Team: Personal Team
# - Check "Automatically manage signing"

# 4. Enable Safari developer settings (IMPORTANT!)
# Safari → Settings → Advanced
# → Check "Show features for web developers"
# Safari → Develop → Allow Unsigned Extensions ✅ CHECK THIS!

# 5. Build and test
# - Select iOS or macOS target in Xcode
# - Click Run (▶️) or Cmd+R
# - Safari → Settings → Extensions → Enable "Lee-Su-Threads"
# - Click extension name → Allow on threads.net
```

## Daily Development

### Method 1: Manual Build
```bash
# 1. Make code changes
vim src/content.js

# 2. Build
npm run build

# 3. In Xcode: Rebuild (Cmd+R)
# That's it! Xcode automatically uses updated files
```

### Method 2: Watch Mode (Recommended)
```bash
# 1. Start watch mode (in terminal)
npm run build:watch

# 2. Make code changes
# Files auto-rebuild when you save

# 3. In Xcode: Just rebuild (Cmd+R)
# No need to manually run npm build
```

## Releasing to the App Store (iOS + macOS)

> **You never hand-edit version numbers.** Both the extension version (shown in
> the popup) and the app's `MARKETING_VERSION` (shown in App Store Connect) are
> derived from the **git tag**. Editing `src/manifest*.json` or `MARKETING_VERSION`
> by hand is what caused past drift (popup stuck at 0.3.7 while Apple saw 1.0.6).

Copy-paste checklist to ship version `X.Y.Z`:

```bash
# 1. Tag the release — this is the single source of truth.
#    (Also triggers the Chrome/Firefox release workflow via GitHub Actions.)
git tag vX.Y.Z
git push origin vX.Y.Z

# 2. Sync the Safari app version from the tag, then rebuild the extension.
npm run set:safari-version   # sets Xcode MARKETING_VERSION from the latest tag (agvtool)
npm run build                # rebuilds dist/safari/ so the popup version == tag

# 3. Verify every version source agrees with the tag. Fix before continuing.
npm run check:versions

# 4. Commit the version bump — project.pbxproj IS tracked in git.
git add "dist-safari/safari-project/Lee-Su-Sui/Lee-Su-Sui.xcodeproj/project.pbxproj"
git commit -m "chore: bump Safari MARKETING_VERSION to X.Y.Z"

# 5. Archive & upload in Xcode:
npm run open:safari
#    - Select the iOS App (or macOS App) scheme
#    - Set the run destination to "Any iOS Device (arm64)"
#    - Product → Archive → Distribute App → App Store Connect
```

**Two version numbers, both from the tag automatically:**

| Number | Where users see it | Set by |
|--------|--------------------|--------|
| Extension manifest `version` | Extension popup (`v1.0.6`) | `npm run build` |
| App `MARKETING_VERSION` | App Store Connect / Apple | `npm run set:safari-version` |

**Re-uploading the same version?** App Store Connect rejects a duplicate build
number. Bump only the build number (not the version) with:

```bash
( cd "dist-safari/safari-project/Lee-Su-Sui" && xcrun agvtool next-version -all )
```

## Commands Reference

| Command | When to Use | Speed |
|---------|-------------|-------|
| `npm run build` | After code changes | Fast (2-3s) |
| `npm run build:watch` | Development mode (auto-rebuild) | Fast |
| `npm run setup:safari` | First time / project corrupted | Slow (20s) |
| `npm run open:safari` | Open Xcode project | Instant |
| `npm run set:safari-version` | Before App Store archive (sets version from git tag) | Instant |
| `npm run check:versions` | Before release (verify versions match the tag) | Instant |

## How It Works

```
src/content.js
    ↓ npm run build
dist/safari/content.js  ← Xcode references this
    ↓ Cmd+R in Xcode
iPhone/Mac Safari ✅
```

The Xcode project **doesn't copy files** - it references `dist/safari/` directly.

## Troubleshooting

**Q: Xcode doesn't see my changes**
```bash
# 1. Make sure you ran npm run build
npm run build

# 2. In Xcode: Clean build folder
# Product → Clean Build Folder (Cmd+Shift+K)

# 3. Rebuild
# Product → Build (Cmd+B)
```

**Q: Extension stopped working**
```bash
# Recreate Xcode project
npm run setup:safari
npm run open:safari
# Reconfigure signing for each target
```

**Q: Want to test production build**
```bash
# Build without watch mode
npm run build

# In Xcode: Change scheme to Release
# Product → Scheme → Edit Scheme
# Build Configuration → Release
```

## Best Practices

✅ **DO:**
- Use `npm run build:watch` during development
- Use `npm run build` before committing
- Keep Xcode open while developing
- Test on real iPhone before App Store submission

❌ **DON'T:**
- Run `npm run setup:safari` for every change
- Edit files in `dist/safari/` directly (they get overwritten by `npm run build`)
- Hand-edit `MARKETING_VERSION` or `src/manifest*.json` versions — use the git tag + `npm run set:safari-version`

> **Note on what's committed:** `dist/` is gitignored (pure build output).
> `dist-safari/` is **partially tracked** — the Xcode project (`project.pbxproj`,
> assets, Swift sources) IS committed; only `build/`, `DerivedData/`, and
> `xcuserdata/` are ignored. So a `MARKETING_VERSION` bump must be committed.
