# Release Checklist

Use this checklist for every KiwiGen release with the bundled dependencies approach.

---

## Pre-Release Checklist

### 1. Version & Changelog

- [ ] Update `package.json` version (e.g., `0.5.0`)
- [ ] Update version references in documentation if needed
- [ ] Review recent commits since last release
- [ ] Ensure all changes are committed

### 2. Local Verification

```bash
# Type check
npx tsc --noEmit
npx tsc -p tsconfig.node.json

# Verify no uncommitted changes
git status
```

### 3. Local Build Test (Recommended)

**Prerequisites:**
```bash
# Install Playwright browsers (for bundling)
npm run install:browsers

# Download Whisper model (for bundling)
mkdir -p models
curl -L -o models/ggml-small.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin
```

**Build locally:**
```bash
# macOS only (requires signing credentials in .env)
npm run build:prod
```

**Expected output:**
- `release/KiwiGen-X.Y.Z-arm64.dmg` (~1.5-2GB)
- `release/KiwiGen-X.Y.Z-arm64-mac.zip`

**Test the built DMG:**
- [ ] Install the DMG
- [ ] Launch the app
- [ ] Verify no first-launch setup screen appears
- [ ] Test a quick recording session
- [ ] Test voice transcription (if enabled)
- [ ] Verify everything works offline

---

## Release Process

### 1. Create Git Tag

```bash
# Tag format: v<package.json version>
git tag -a v0.5.0 -m "Release v0.5.0"
git push origin v0.5.0
```

**Important:** Tag must match `package.json` version exactly with `v` prefix.

### 2. Create GitHub Release

1. Go to: https://github.com/hotovo/kiwigen/releases/new
2. Select tag: `vX.Y.Z`
3. Release title: `vX.Y.Z`
4. Write release notes (see template below)
5. Click "Publish release"

**Release Notes Template:**
```markdown
## 🎉 KiwiGen vX.Y.Z

[Brief description of main changes]

### ✨ What's New
- Feature 1
- Feature 2
- Bug fix 3

### 📦 Installation
- **macOS ARM64**: Download `KiwiGen-X.Y.Z-arm64.dmg` (~1.5GB)
- **Windows x64**: Download `KiwiGen-Setup-X.Y.Z.exe` (~1.2GB)

All dependencies are bundled - no additional downloads required. Works offline immediately after installation.

### 🔄 Upgrade Notes
[Any breaking changes or migration notes if applicable]

**Full Changelog**: https://github.com/hotovo/kiwigen/compare/vPREV...vX.Y.Z
```

### 3. CI Build (Automatic)

Publishing the GitHub release automatically triggers `.github/workflows/build.yml`:

**What CI does:**
1. ✅ Builds signed & notarized macOS ARM64 installer with bundled dependencies
2. ✅ Builds unsigned Windows x64 installer with bundled dependencies
3. ✅ Uploads installers to the release

**Typical duration:** 20-30 minutes

**Monitor progress:**
- Go to: https://github.com/hotovo/kiwigen/actions
- Watch "Build and Publish KiwiGen Release" workflow

---

## Post-Release Validation

### 1. Verify Release Assets

Check that the release page contains:
- [ ] `KiwiGen-X.Y.Z-arm64.dmg` (macOS installer, ~1.5-2GB)
- [ ] `KiwiGen-X.Y.Z-arm64-mac.zip` (macOS portable)
- [ ] `KiwiGen-Setup-X.Y.Z.exe` (Windows installer, ~1.2GB)

**Expected sizes:**
- macOS DMG: ~1.5-2GB (includes Chromium ~300-400MB, Whisper model ~465MB, binaries)
- Windows EXE: ~1.2GB

### 2. Smoke Test Fresh Install

**macOS:**
```bash
# Download the DMG from release
# Install the app
# Launch and verify:
# - No first-launch setup screen
# - Can start recording immediately
# - Transcription works
# - Everything works offline
```

**Windows (if accessible):**
- Download the EXE from release
- Install and launch
- Verify same behavior

### 3. Test URLs

Verify installers are downloadable:
- macOS DMG: `https://github.com/hotovo/kiwigen/releases/download/vX.Y.Z/KiwiGen-X.Y.Z-arm64.dmg`
- Windows EXE: `https://github.com/hotovo/kiwigen/releases/download/vX.Y.Z/KiwiGen-Setup-X.Y.Z.exe`

---

## Recovery Path (If CI Fails)

If CI fails before uploading assets:

### Option 1: Re-run Workflow

1. Go to: https://github.com/hotovo/kiwigen/actions/workflows/build.yml
2. Click "Run workflow"
3. Enter `release_tag`: `vX.Y.Z`
4. Click "Run workflow"

### Option 2: Manual Build & Upload

**macOS (requires signing credentials):**
```bash
# Ensure prerequisites are ready
npm run install:browsers
curl -L -o models/ggml-small.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin

# Build
npm run build:prod

# Upload to release
gh release upload vX.Y.Z release/KiwiGen-*.dmg release/KiwiGen-*.zip
```

---

## Common Issues

### "Tag/version mismatch"
- Ensure `package.json` version matches tag (e.g., `0.5.0` → `v0.5.0`)
- Tag must start with `v`

### "CI build fails: Whisper model not found"
- CI downloads model automatically during build
- Check if Hugging Face URL is accessible: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin

### "CI build fails: Playwright browsers not installed"
- CI runs `npm run install:browsers` automatically
- Check if Playwright CDN is accessible

### "macOS signing/notarization fails"
- Verify GitHub secrets are set:
  - `MACOS_CERTIFICATE` (base64-encoded .p12)
  - `MACOS_CERTIFICATE_PASSWORD`
  - `APPLE_ID`
  - `APPLE_APP_SPECIFIC_PASSWORD`
  - `APPLE_TEAM_ID`

### "Windows SmartScreen warning"
- Expected behavior (Windows build is unsigned)
- Users need to click "More info" → "Run anyway"

---

## Quick Reference

### Required GitHub Secrets

For macOS signing & notarization:
- `MACOS_CERTIFICATE` - Base64-encoded Developer ID Application certificate (.p12)
- `MACOS_CERTIFICATE_PASSWORD` - Certificate password
- `APPLE_ID` - Apple Developer account email
- `APPLE_APP_SPECIFIC_PASSWORD` - App-specific password from appleid.apple.com
- `APPLE_TEAM_ID` - 10-character team ID (e.g., `ABC123XYZ4`)

### File Sizes Reference

| Artifact | Approximate Size |
|----------|------------------|
| macOS DMG | ~1.5-2GB |
| macOS ZIP | ~1.5GB |
| Windows EXE | ~1.2GB |

### What's Bundled

- Electron runtime (~200MB)
- Chromium browser (~300-400MB)
- Whisper model (`ggml-small.en.bin`, ~465MB)
- Whisper binaries (~5MB)
- ffmpeg (~50MB)
- Node modules & app code (~100MB)

---

## Notes

- **No runtime assets**: Unlike v0.4.x, there are no separate runtime assets to package or manifest files to generate
- **Offline-first**: Installers work completely offline after download
- **Simpler workflow**: No dependency download on first launch
- **Larger installers**: Trade-off for simplicity and reliability

---

## Checklist Template (Copy for Each Release)

```markdown
## Release vX.Y.Z Checklist

### Pre-Release
- [ ] Update package.json version
- [ ] Type check passes
- [ ] Local build test (optional but recommended)
- [ ] Git status clean

### Release
- [ ] Create tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
- [ ] Push tag: `git push origin vX.Y.Z`
- [ ] Create GitHub Release with notes
- [ ] Monitor CI workflow (20-30 min)

### Post-Release
- [ ] Verify all 3 assets uploaded (2 macOS, 1 Windows)
- [ ] Check file sizes look correct (~1.5-2GB macOS, ~1.2GB Windows)
- [ ] Smoke test macOS DMG install
- [ ] Smoke test Windows EXE install (if accessible)
- [ ] Release announcement (if applicable)

### Issues?
- [ ] Check CI logs for errors
- [ ] Re-run workflow if needed
- [ ] Manual upload if CI repeatedly fails
```
