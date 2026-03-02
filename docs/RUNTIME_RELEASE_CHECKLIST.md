# Runtime Release Checklist

Use this checklist for each release so first-launch runtime dependency setup works.

## Non-negotiable rules

- [ ] Release tag must match app version exactly: `v<package.json version>` (example: `0.4.0` -> `v0.4.0`)
- [ ] `runtime-manifest.json` must be uploaded as a GitHub Release asset on that same tag
- [ ] All runtime artifacts must be uploaded at the release asset root (flat file list, no subpaths)
- [ ] Do not rename artifact files after packaging (manifest URLs/checksums depend on exact names)

---

## 1) Prepare runtime assets

## macOS ARM64 (local macOS machine)

- [ ] Quick path (recommended): `npm run runtime:prepare:mac`
  - Runs browser install + mac runtime packaging using `v<package.json version>` automatically
  - Writes output to `release/runtime-assets/darwin-arm64`
- [ ] Ensure model exists at `models/ggml-small.en.bin`
- [ ] Install Chromium runtime: `npm run install:browsers`
- [ ] Package macOS artifacts:

```bash
node ./build/package-runtime-assets.js \
  --platform darwin-arm64 \
  --release-tag vX.Y.Z \
  --output release/runtime-assets/darwin-arm64
```

Expected output in `release/runtime-assets/darwin-arm64`:
- `dodo-runtime-whisper-model-small.en.bin`
- `dodo-runtime-whisper-binary-darwin-arm64`
- `dodo-runtime-playwright-darwin-arm64-chromium-*.zip`
- `asset-metadata.darwin-arm64.json`

## Windows x64 (GitHub Actions)

- [ ] Run workflow **Build Dodo Recorder** with `release_tag=vX.Y.Z`
- [ ] Confirm workflow artifact `dodo-runtime-assets-win32-x64` exists
- [ ] Download the workflow artifact and place files under `release/runtime-assets/win32-x64`

Expected output in `release/runtime-assets/win32-x64`:
- `dodo-runtime-whisper-model-small.en.bin`
- `dodo-runtime-whisper-binary-win32-x64.zip`
- `dodo-runtime-playwright-win32-x64-chromium-*.zip`
- `asset-metadata.win32-x64.json`

---

## 2) Generate and verify manifest

- [ ] Generate combined manifest (must include both platforms):

```bash
node ./build/generate-runtime-manifest.js \
  --metadata-dir release/runtime-assets \
  --output release/runtime-assets/runtime-manifest.json
```

Note: by default this command requires metadata for both `darwin-arm64` and `win32-x64`.
If you only have macOS metadata locally (before collecting Windows artifacts), you can generate a temporary local manifest with:

```bash
node ./build/generate-runtime-manifest.js \
  --metadata-dir release/runtime-assets \
  --output release/runtime-assets/runtime-manifest.json \
  --require-platforms false
```

Do not publish a single-platform manifest for a cross-platform release.

- [ ] Verify manifest structure:

```bash
node ./build/verify-runtime-manifest.js \
  --manifest release/runtime-assets/runtime-manifest.json
```

---

## 3) Upload to GitHub Release (asset root)

Target release: `https://github.com/dodosaurus/dodo-recorder/releases/tag/vX.Y.Z`

Required release assets:
- [ ] `runtime-manifest.json`
- [ ] `dodo-runtime-whisper-model-small.en.bin` (upload once)
- [ ] `dodo-runtime-whisper-binary-darwin-arm64`
- [ ] `dodo-runtime-whisper-binary-win32-x64.zip` (includes exe + DLLs)
- [ ] `dodo-runtime-playwright-darwin-arm64-chromium-*.zip`
- [ ] `dodo-runtime-playwright-win32-x64-chromium-*.zip`

Example upload command:

```bash
gh release upload vX.Y.Z \
  release/runtime-assets/runtime-manifest.json \
  release/runtime-assets/darwin-arm64/dodo-runtime-whisper-model-small.en.bin \
  release/runtime-assets/darwin-arm64/dodo-runtime-whisper-binary-darwin-arm64 \
  release/runtime-assets/win32-x64/dodo-runtime-whisper-binary-win32-x64.zip \
  release/runtime-assets/darwin-arm64/dodo-runtime-playwright-darwin-arm64-chromium-*.zip \
  release/runtime-assets/win32-x64/dodo-runtime-playwright-win32-x64-chromium-*.zip \
  --clobber
```

---

## 4) Post-upload validation

- [ ] Validate release URLs from manifest:

```bash
node ./build/verify-runtime-manifest.js \
  --manifest release/runtime-assets/runtime-manifest.json \
  --check-urls true
```

- [ ] Smoke test clean install:
  - Delete runtime cache:
    - macOS: `~/Library/Application Support/dodo-recorder/runtime-deps/`
    - Windows: `%USERPROFILE%\AppData\Roaming\dodo-recorder\runtime-deps\`
  - Launch app and run **Install Runtime Dependencies**
  - Confirm flow reaches `ready`

---

## Quick failure checks

If first-launch setup fails, check in this order:

1. Tag/version mismatch (`v<app version>` not respected)
2. `runtime-manifest.json` missing from release assets
3. One or more runtime assets missing on release
4. Asset filename changed after manifest generation
5. SHA256 mismatch (regenerate metadata + manifest)
