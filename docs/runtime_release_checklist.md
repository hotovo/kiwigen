# Runtime Release Checklist

Small checklist for publishing first-launch runtime dependencies (Whisper + Chromium).

## 1) Prepare macOS runtime assets locally

- Ensure local sources exist:
  - `models/unix/whisper`
  - `models/ggml-small.en.bin`
- Install Chromium locally:

```bash
npm run install:browsers
```

- Package macOS runtime assets:

```bash
node ./build/package-runtime-assets.js \
  --platform darwin-arm64 \
  --release-tag vX.Y.Z \
  --output release/runtime-assets/darwin-arm64
```

## 2) Build app installers

- Build and collect app artifacts as usual:
  - macOS locally
  - Windows via CI workflow

## 3) Get Windows runtime assets from CI

- Trigger `Build Dodo Recorder` with `release_tag=vX.Y.Z`
- Download artifact `dodo-runtime-assets-win32-x64`
- Place files under `release/runtime-assets/win32-x64/`

## 4) Generate combined runtime manifest

```bash
node ./build/generate-runtime-manifest.js \
  --metadata-dir release/runtime-assets \
  --output release/runtime-assets/runtime-manifest.json
```

## 5) Verify manifest before upload

```bash
node ./build/verify-runtime-manifest.js \
  --manifest release/runtime-assets/runtime-manifest.json
```

After uploading assets to GitHub Release, validate URLs:

```bash
node ./build/verify-runtime-manifest.js \
  --manifest release/runtime-assets/runtime-manifest.json \
  --check-urls true
```

## 6) Upload release assets (GitHub Release)

- Upload app installers (`.dmg`, `.zip`, Windows `.exe` files)
- Upload runtime assets:
  - `dodo-runtime-whisper-model-small.en.bin`
  - `dodo-runtime-whisper-binary-darwin-arm64`
  - `dodo-runtime-whisper-binary-win32-x64.exe`
  - `dodo-runtime-playwright-darwin-arm64-<chromium-version>.zip`
  - `dodo-runtime-playwright-win32-x64-<chromium-version>.zip`
  - `runtime-manifest.json`

## 7) Smoke test on clean profiles

- macOS clean profile:
  - Install app
  - Confirm setup gate appears
  - Install runtime dependencies
  - Start and stop a short recording
- Windows clean profile:
  - Same checks as macOS

## Done criteria

- First launch installs runtime dependencies successfully on both platforms
- Recording + transcription work without bundled model/browser files
- `main.log` has no runtime manifest/install errors
