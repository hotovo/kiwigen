# Runtime Release Checklist

Use this checklist for every release. Runtime artifacts and `runtime-manifest.json` are now generated and uploaded automatically by CI.

## Non-negotiable rules

- [ ] Release tag must match app version exactly: `v<package.json version>` (example: `0.4.2` -> `v0.4.2`)
- [ ] Publish a GitHub Release on that tag (this triggers the automation workflow)
- [ ] Do not manually upload runtime assets unless you are recovering from a failed CI run

---

## 1) Prepare source and tag locally

- [ ] Commit the exact changes you want to ship
- [ ] Verify `package.json` version is final
- [ ] Create and push tag:

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

---

## 2) Publish GitHub Release

- [ ] Open `https://github.com/hotovo/kiwigen/releases/new`
- [ ] Select tag `vX.Y.Z`
- [ ] Publish release

Publishing triggers [`build.yml`](../.github/workflows/build.yml) automatically.

---

## 3) CI workflow responsibilities (automatic)

When release is published, CI will:

1. Build signed/notarized macOS installer artifacts.
2. Build unsigned Windows installer artifacts.
3. Package runtime assets on both platforms:
   - `kiwigen-runtime-whisper-model-small.en.bin`
   - `kiwigen-runtime-whisper-binary-darwin-arm64`
   - `kiwigen-runtime-whisper-binary-win32-x64.zip`
   - `kiwigen-runtime-playwright-<platform>-chromium-*.zip`
   - platform metadata JSON files
4. Generate combined `runtime-manifest.json` from both metadata files.
5. Verify manifest structure.
6. Upload installers + runtime assets + `runtime-manifest.json` to the same release tag.
7. Verify uploaded runtime URLs (with retry for GitHub asset propagation delay).

---

## 4) Post-run validation

- [ ] In the release page, confirm these assets exist:
  - `runtime-manifest.json`
  - `kiwigen-runtime-whisper-model-small.en.bin`
  - `kiwigen-runtime-whisper-binary-darwin-arm64`
  - `kiwigen-runtime-whisper-binary-win32-x64.zip`
  - `kiwigen-runtime-playwright-darwin-arm64-chromium-*.zip`
  - `kiwigen-runtime-playwright-win32-x64-chromium-*.zip`
  - macOS installer artifacts (`.dmg`, `.zip`)
  - Windows installer artifacts (`.exe`)
- [ ] Smoke test first-launch setup from a clean runtime cache:
  - macOS: `~/Library/Application Support/kiwigen/runtime-deps/`
  - Windows: `%USERPROFILE%\AppData\Roaming\kiwigen\runtime-deps\`

---

## Recovery path (only if release trigger fails)

If release event was missed or CI failed before upload:

1. Re-run the workflow manually via `workflow_dispatch`.
2. Pass `release_tag=vX.Y.Z`.
3. Validate the release assets again.

---

## Quick failure checks

If first-launch setup fails, check in this order:

1. Tag/version mismatch (`v<app version>` not respected)
2. `runtime-manifest.json` missing from release assets
3. One or more runtime assets missing on release
4. Asset filename changed after packaging
5. SHA256 mismatch (regenerate metadata + manifest)
