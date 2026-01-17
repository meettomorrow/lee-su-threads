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

## Commands Reference

| Command | When to Use | Speed |
|---------|-------------|-------|
| `npm run build` | After code changes | Fast (2-3s) |
| `npm run build:watch` | Development mode (auto-rebuild) | Fast |
| `npm run setup:safari` | First time / project corrupted | Slow (20s) |
| `npm run open:safari` | Open Xcode project | Instant |

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
- Edit files in `dist/safari/` directly (they get overwritten)
- Commit `dist/` or `dist-safari/` to git (they're gitignored)
