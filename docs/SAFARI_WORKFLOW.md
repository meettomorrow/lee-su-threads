# Safari Development Workflow

There are **two separate modes** — don't mix them up:

1. **Develop & test** (most of the time): edit code → `npm run build` → Run in
   Xcode on the Simulator or a real iPhone. **No git tag, no version steps** —
   build and run as often as you like. Version numbers are irrelevant here.
2. **Release to the App Store** (only when shipping): decide the version, sync it
   from a git tag, verify, then archive & upload. See
   [Releasing to the App Store](#releasing-to-the-app-store-ios--macos).

The version ceremony (`set:safari-version` / tag / `check:versions`) applies
**only** to the App Store archive+upload — never to on-device test builds.

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

### Testing on a real iPhone

Connect the iPhone, select it as the Xcode run destination, and Run (Cmd+R) —
same as the Simulator. **No version steps and no git tag are needed**; the popup
just shows whatever the latest version tag is (or `tag + 1` in watch mode). Test
freely, then do the version ceremony only when you're ready to ship.

## Releasing to the App Store (iOS + macOS)

> **You never hand-edit version numbers.** Both the extension version (shown in
> the popup) and the app's `MARKETING_VERSION` (shown in App Store Connect) are
> derived from the **git tag**. Editing `src/manifest*.json` or `MARKETING_VERSION`
> by hand is what caused past drift (popup stuck at 0.3.7 while Apple saw 1.0.6).

**Order matters.** Pushing the tag immediately triggers the Chrome/Firefox
release workflow and publishes a public GitHub Release — that half can't be
un-shipped. So **verify everything locally first, and push the tag last.**
Because `project.pbxproj` is committed, the version bump must also land *before*
the tag points at it.

Copy-paste checklist to ship version `X.Y.Z`:

```bash
# 1. Set the Safari app version explicitly (no tag needed yet — this is what
#    lets the version bump be committed BEFORE the tag exists).
npm run set:safari-version X.Y.Z   # writes MARKETING_VERSION into project.pbxproj (no Xcode needed)

# 2. Commit the bump so the tag (next step) points at a commit that has it.
#    project.pbxproj IS tracked in git.
git add "dist-safari/safari-project/Lee-Su-Sui/Lee-Su-Sui.xcodeproj/project.pbxproj"
git commit -m "chore: bump Safari MARKETING_VERSION to X.Y.Z"

# 3. Tag that commit LOCALLY — do NOT push yet. The extension build reads the
#    version from this tag.
git tag vX.Y.Z

# 4. Build from the tag, then verify everything agrees — BEFORE anything ships.
npm run build            # dist/safari/manifest.json version == X.Y.Z
npm run check:versions   # tag / MARKETING_VERSION / dist/* all == X.Y.Z

# 5. Green? Push the tag. This ships Chrome/Firefox and publishes a public
#    GitHub Release — the irreversible step, done last on purpose.
git push origin vX.Y.Z

# 6. Archive & upload the Safari/iOS app in Xcode:
npm run open:safari
#    - Select the iOS App (or macOS App) scheme
#    - Set the run destination to "Any iOS Device (arm64)"
#    - Product → Archive → Distribute App → App Store Connect
```

If `check:versions` (step 4) fails, fix it and re-run — nothing has shipped yet
because the tag is still local. If you need to abandon the version, delete the
local tag (`git tag -d vX.Y.Z`) before it's pushed.

**Two version numbers, both from the tag automatically:**

| Number | Where users see it | Set by |
|--------|--------------------|--------|
| Extension manifest `version` | Extension popup (`v1.0.6`) | `npm run build` |
| App `MARKETING_VERSION` | App Store Connect / Apple | `npm run set:safari-version` |

**Re-uploading the same version?** App Store Connect rejects a duplicate build
number. Bump only the build number (`CURRENT_PROJECT_VERSION`), not the version.
It lives in `project.pbxproj` alongside `MARKETING_VERSION` — edit it directly.
(Don't reach for `agvtool next-version`: this project sets no
`VERSIONING_SYSTEM = APPLE_GENERIC` and the Info.plists carry no `CFBundleVersion`
key, so agvtool writes nothing and reports success anyway — the same silent no-op
that once left `MARKETING_VERSION` stale.)

```bash
PBXPROJ="dist-safari/safari-project/Lee-Su-Sui/Lee-Su-Sui.xcodeproj/project.pbxproj"
# Pick the next integer (they're all in sync — currently 1, so use 2, etc.):
perl -i -pe 's/CURRENT_PROJECT_VERSION = [^;]*;/CURRENT_PROJECT_VERSION = 2;/g' "$PBXPROJ"
grep -c 'CURRENT_PROJECT_VERSION = 2;' "$PBXPROJ"   # expect 8 — one per build config
```

## Commands Reference

| Command | When to Use | Speed |
|---------|-------------|-------|
| `npm run build` | After code changes | Fast (2-3s) |
| `npm run build:watch` | Development mode (auto-rebuild) | Fast |
| `npm run setup:safari` | First time / project corrupted | Slow (20s) |
| `npm run open:safari` | Open Xcode project | Instant |
| `npm run set:safari-version X.Y.Z` | Before App Store archive (sets `MARKETING_VERSION`) | Instant |
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
> ⚠️ `npm run setup:safari` runs the converter with `--force` and regenerates
> `project.pbxproj` wholesale, resetting `MARKETING_VERSION` (and signing). After
> re-running it, re-apply the version with `npm run set:safari-version X.Y.Z`
> before archiving.

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
