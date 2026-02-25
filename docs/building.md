# Building Dodo Recorder

This document describes how to build Dodo Recorder for local testing and production distribution.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Development Mode](#development-mode)
- [Local Test Build](#local-test-build)
- [Production Build](#production-build)
- [Runtime Asset Release Pipeline](#runtime-asset-release-pipeline)
- [Creating a Release Tag](#creating-a-release-tag)
- [Build Scripts](#build-scripts)
- [Build Configuration](#build-configuration)
- [Environment Variables](#environment-variables)
- [CI/CD Pipeline](#cicd-pipeline)
- [Build Artifacts](#build-artifacts)
- [Runtime Release Checklist](#runtime-release-checklist)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before building Dodo Recorder, ensure you have:

- **Node.js 18+** and npm
- **Git**
- **macOS Apple Silicon** or **Windows x64**

### Runtime Dependencies (First Launch)

Production installers no longer bundle Whisper model/binaries or Playwright Chromium.
The app downloads required runtime dependencies on first launch into the user data directory.

In transition builds, the app can also import legacy bundled assets (if present) into the new runtime directory.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run in development mode
npm run dev
```

---

## Development Mode

```bash
npm run dev
```

This starts:
- **Vite dev server** for the React frontend (hot reload enabled)
- **Electron** in watch mode

Changes to source files will automatically reload the app.

---

## Local Test Build

For local testing without code signing:

```bash
npm run build
```

**What this does:**
1. Generates `build-info.json` with git commit hash and build timestamp
2. Builds the React frontend with Vite to `dist/`
3. Runs `electron-builder` with `electron-builder.test.json` configuration
4. Builds **macOS ARM64 only** (no Windows support in test build so far)
5. Creates unsigned `.dmg` and `.zip` files in `release/`

**Output location:** `release/` directory

**Platform support:** macOS ARM64 only

**Signing:** None (identity set to `null`)

---

## Production Build

> **Note:** Code signing and notarization is only relevant for the main maintainer. For contributors, use the [Local Test Build](#local-test-build) instead.

For signed and notarized production builds:

```bash
npm run build:prod
```

**What this does:**
1. Loads environment variables from `.env` file (if present)
2. Generates `build-info.json` with git commit hash and build timestamp
3. Builds the React frontend with Vite to `dist/`
4. Detects the current platform and builds accordingly:
   - **macOS ARM64**: Signed + notarized `.dmg` and `.zip`
   - **Windows x64**: NSIS installer + portable executable
5. Creates output in `release/` directory

**Output location:** `release/` directory

**Platform support:** macOS ARM64, Windows x64

**Signing:** Full code signing and notarization (macOS), no signing (Windows)

---

## Runtime Asset Release Pipeline

Runtime dependencies are published as GitHub release assets and downloaded on first launch.

### Asset naming and manifest

Each release should include:

- `dodo-runtime-whisper-model-small.en.bin`
- `dodo-runtime-whisper-binary-darwin-arm64`
- `dodo-runtime-whisper-binary-win32-x64.exe`
- `dodo-runtime-playwright-darwin-arm64-<chromium-version>.zip`
- `dodo-runtime-playwright-win32-x64-<chromium-version>.zip`
- `runtime-manifest.json`

### macOS local flow (maintainer)

1. Prepare local runtime inputs:
   - Ensure `models/unix/whisper` exists
   - Ensure `models/ggml-small.en.bin` exists
   - Ensure Chromium is installed locally: `npm run install:browsers`
2. Package macOS runtime assets:

```bash
node ./build/package-runtime-assets.js \
  --platform darwin-arm64 \
  --release-tag v0.4.0 \
  --output release/runtime-assets/darwin-arm64
```

This outputs mac runtime files + `asset-metadata.darwin-arm64.json`.

### Windows CI flow

When `release_tag` is provided in GitHub Actions (`Build Dodo Recorder` workflow), the Windows job also:

1. Installs Chromium runtime (`npm run install:browsers`)
2. Downloads Whisper model
3. Packages Windows runtime assets
4. Uploads artifact `dodo-runtime-assets-win32-x64`

If `upload-to-release` runs, Windows runtime asset files are attached to that GitHub Release automatically.

### Generate combined runtime manifest (local)

After you have:

- local mac runtime metadata in `release/runtime-assets/darwin-arm64/`
- Windows metadata downloaded from CI artifact (place under `release/runtime-assets/win32-x64/`)

Generate manifest:

```bash
node ./build/generate-runtime-manifest.js \
  --metadata-dir release/runtime-assets \
  --output release/runtime-assets/runtime-manifest.json
```

Verify manifest:

```bash
node ./build/verify-runtime-manifest.js \
  --manifest release/runtime-assets/runtime-manifest.json

# Optional: verify URLs after uploading assets
node ./build/verify-runtime-manifest.js \
  --manifest release/runtime-assets/runtime-manifest.json \
  --check-urls true
```

Upload `runtime-manifest.json` to the same GitHub Release as the runtime assets.

### Runtime manifest resolution in app

At startup, the app tries to fetch:

`https://github.com/dodosaurus/dodo-recorder/releases/download/v<app-version>/runtime-manifest.json`

You can override this for testing with:

- `DODO_RUNTIME_MANIFEST_URL`

If remote fetch fails, the app falls back to bundled manifest defaults.

---

## Runtime Release Checklist

For the quick release sequence, use [`runtime_release_checklist.md`](runtime_release_checklist.md).

---

## Creating a Release Tag

After bumping the version in `package.json` and `CHANGELOG.md`, create a Git tag to mark the release:

```bash
# 1. Verify changes are committed
git status

# 2. Create annotated tag with version number
git tag -a v0.3.0 -m "Release v0.3.0"

# 3. Push the tag to remote repository
git push origin v0.3.0

# 4. Push all tags (alternative)
git push origin --tags
```

**Tag Naming Convention:**
- Use semantic versioning with `v` prefix: `v0.3.0`, `v1.0.0`, etc.
- Use annotated tags (`-a` flag) to include release notes
- Tag should match the version in `package.json`

**Viewing Tags:**

```bash
# List all tags
git tag

# Show tag details
git show v0.3.0

# List tags in chronological order
git tag --sort=-creatordate
```

**Deleting Tags (if needed):**

```bash
# Delete local tag
git tag -d v0.3.0

# Delete remote tag
git push origin --delete v0.3.0
```

**CI/CD Integration:**

When creating a GitHub Release:
1. Create the tag locally and push as shown above
2. Go to GitHub → Releases → "Draft a new release"
3. Select the tag you just pushed
4. Copy the changelog from `CHANGELOG.md`
5. Upload the build artifacts from `release/`
6. Publish the release

Alternatively, you can specify the `release_tag` parameter when triggering the CI/CD workflow to automatically upload artifacts to the release.

---

## Build Scripts

### `npm run dev`

Starts the development server with hot reload.

### `npm run build`

Runs `build/build.js` for local test builds.

### `npm run build:prod`

Runs `build/build-prod.js` for production builds.

### `npm run install:browsers`

Installs Playwright browsers to `playwright-browsers/` for runtime asset preparation.

### `npm run postinstall` (automatic)

Prints a no-op message. Runtime dependencies are handled by in-app setup.

### `npm run generate-icons`

Runs `build/generate-icons.sh` to generate app icons from source.

---

## Build Configuration

### Test Build Configuration (`electron-builder.test.json`)

Used for local testing without code signing.

**Key differences from production:**
- `hardenedRuntime: false`
- No `entitlements` or `entitlementsInherit`
- `type: "development"`
- No notarization configuration

**Targets:**
- macOS: `.dmg`, `.zip`
- Windows: `.nsis`, `.portable` (not used in test build script)

### Production Build Configuration (`electron-builder.json`)

Used for production releases with full signing and notarization.

**macOS configuration:**
```json
{
  "target": ["dmg", "zip"],
  "icon": "build/icon.icns",
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist",
  "extendInfo": {
    "NSMicrophoneUsageDescription": "Dodo Recorder needs microphone access..."
  },
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "category": "public.app-category.developer-tools",
  "type": "distribution",
  "notarize": {
    "teamId": "L7PUGF6Q28"
  }
}
```

**Windows configuration:**
```json
{
  "target": ["nsis", "portable"],
  "icon": "build/icon.ico",
  "sign": null,
  "signAndEditExecutable": false
}
```

**Extra Resources (bundled with app):**
- `node_modules/ffmpeg-static` - FFmpeg binaries

**ASAR Unpack:**
- `**/*.node` - Native Node.js modules

---

## Environment Variables

> **Note:** The following environment variables are only needed for the main maintainer to sign and notarize production builds. Contributors can skip this section and use [Local Test Build](#local-test-build) instead.

Create a `.env` file in the project root (copy from `.env.example`).

### Required for macOS Notarization

| Variable | Description | Example |
|----------|-------------|---------|
| `APPLE_ID` | Your Apple ID email | `your-apple-id@example.com` |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password (generate at appleid.apple.com) | `abcd-efgh-ijkl-mnop` |
| `APPLE_TEAM_ID` | Your Apple Developer Team ID | `L7PUGF6Q28` |

### Optional for macOS Code Signing

Choose one method:

**Method 1: Explicit .p12 certificate**
```bash
CSC_LINK=./certificate.p12
CSC_KEY_PASSWORD=your-p12-password
```

**Method 2: Keychain auto-discovery (default)**
- Don't set `CSC_LINK` or `CSC_KEY_PASSWORD`
- electron-builder will auto-discover from Keychain
- Requires properly named "Developer ID Application: Your Name (TEAM_ID)"

**Method 3: Explicit certificate name**
```bash
CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"
```

### Example `.env` File

```bash
# Apple Developer credentials
APPLE_ID="your-apple-id@example.com"
APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
APPLE_TEAM_ID="L7PUGF6Q28"

# Optional: Explicit certificate file
CSC_LINK=./certificate.p12
CSC_KEY_PASSWORD=your-p12-password
```

---

## CI/CD Pipeline

> **Note:** The CI/CD pipeline is managed by the main maintainer. Contributors do not need to trigger builds manually.

The GitHub Actions workflow (`.github/workflows/build.yml`) builds Dodo Recorder for macOS ARM64 and Windows x64.

### Workflow Trigger

**Manual trigger only** via GitHub Actions UI.

**To trigger a build:**
1. Go to **Actions** → **Build Dodo Recorder** workflow
2. Click **Run workflow**
3. Select branch (usually `main`)
4. Choose platforms from dropdown:
   - `macos-arm64,windows` (both)
   - `macos-arm64` (macOS only)
   - `windows` (Windows only)
5. Optional: Enter `release_tag` (e.g., `v1.0.0`) to upload to release
6. Click **Run workflow**

### Build Jobs

#### `build-macos-arm64`

Runs on `macos-latest`:

1. **Checkout code** - Checks out the specified branch or tag
2. **Setup Node.js 18** - Uses `actions/setup-node@v4`
3. **Cache npm dependencies** - Caches `~/.npm` based on `package-lock.json`
4. **Install dependencies** - Runs `npm ci`
5. **Import Code Signing Certificate** - Decodes base64 certificate from secrets and imports to keychain
6. **Build** - Runs `npm run build:prod` with environment variables
7. **Upload artifacts** - Uploads `.dmg` and `.zip` files (30-day retention)

#### `build-windows`

Runs on `windows-latest`:

1. **Checkout code** - Checks out the specified branch or tag
2. **Setup Node.js 18** - Uses `actions/setup-node@v4`
3. **Cache npm dependencies** - Caches npm based on `package-lock.json`
4. **Install dependencies** - Runs `npm ci`
5. **Build** - Runs `npm run build:prod`
6. **Upload artifacts** - Uploads `.exe` file (30-day retention)

#### `upload-to-release`

Runs on `ubuntu-latest` when `release_tag` is provided:

1. **Checkout code** - Checks out the specified tag
2. **Download all artifacts** - Downloads artifacts from previous jobs
3. **Upload to GitHub Release** - Uses `softprops/action-gh-release@v1` to attach artifacts to the release

### GitHub Secrets

Required for macOS code signing and notarization:

| Secret | Description |
|--------|-------------|
| `MACOS_CERTIFICATE` | Base64-encoded Developer ID Application certificate (.p12) |
| `MACOS_CERTIFICATE_PASSWORD` | Password for the .p12 certificate |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

**Setup:** Settings → Secrets and variables → Actions → New repository secret

**Without secrets:** macOS builds will fail (certificate required for signing).

---

## Build Artifacts

### Local Test Build

| Platform | Artifacts | Location |
|----------|-----------|----------|
| macOS ARM64 | `Dodo Recorder-<version>-arm64.dmg`<br>`Dodo Recorder-<version>-arm64-mac.zip` | `release/` |

### Production Build

| Platform | Artifacts | Location |
|----------|-----------|----------|
| macOS ARM64 | `Dodo Recorder-<version>-arm64.dmg`<br>`Dodo Recorder-<version>-arm64-mac.zip` | `release/` |
| Windows x64 | `Dodo Recorder Setup <version>.exe`<br>`Dodo Recorder <version>.exe` (portable) | `release/` |

### CI/CD Artifacts

Artifacts are retained for 30 days in the GitHub Actions tab. If a `release_tag` is provided, they are also attached to the GitHub release.

---

## Troubleshooting

### "Runtime dependency install failed" Error

**Problem:** App cannot download or verify runtime dependencies.

**Solution:**
1. Confirm network access to GitHub release assets
2. Re-run setup from the first-launch setup screen
3. Verify free disk space in the user data location
4. Check logs (`main.log`) for the failing artifact and checksum details

### macOS Code Signing Fails

> **Note:** This section is only relevant for the main maintainer. Contributors using [Local Test Build](#local-test-build) do not need to worry about signing.

**Problem:** Build fails during code signing

**Common errors and solutions:**

**"cannot find valid 'Developer ID Application' identity":**
- Certificate has UUID name instead of proper "Developer ID Application: Your Name (TEAM_ID)" format
- Use `CSC_LINK=./certificate.p12` with `CSC_KEY_PASSWORD` to bypass Keychain auto-discovery
- Or specify `CSC_NAME` with the SHA-1 hash from `security find-identity -v -p codesigning`

**"not a file" during CI/CD build:**
- `MACOS_CERTIFICATE` secret is not set or invalid
- Ensure certificate is exported as .p12 and converted to base64 without extra whitespace

**General solutions:**
1. Verify all secrets are set correctly (for CI/CD)
2. Check `.env` file exists and contains correct values (for local builds)
3. Verify `APPLE_TEAM_ID` matches your certificate
4. Ensure certificate includes "Developer ID Application"

### macOS Notarization Fails

> **Note:** This section is only relevant for the main maintainer. Contributors using [Local Test Build](#local-test-build) do not need to worry about notarization.

**Problem:** Build succeeds but app is not notarized

**Common errors and solutions:**

**"HTTP status code: 403. A required agreement is missing or has expired":**
- Go to [Apple Developer portal](https://developer.apple.com/account)
- Review and accept all required agreements (updated annually)
- Wait a few minutes for changes to propagate

**"Unexpected token 'E', is not valid JSON":**
- Invalid or expired `APPLE_APP_SPECIFIC_PASSWORD`
- Generate new app-specific password at [appleid.apple.com](https://appleid.apple.com)
- Verify credentials with: `xcrun notarytool history --apple-id "..." --password "..." --team-id "..."`

**General solutions:**
1. Verify all Apple credentials are set: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
2. Check your Apple Developer account is in good standing
3. The build will warn if credentials are missing

---

### Verifying Signed & Notarized Builds

After a production build, verify the app is properly signed and notarized:

```bash
# Check signature
codesign -dv --verbose=4 release/mac-arm64/Dodo\ Recorder.app

# Check notarization
spctl -a -vv -t install release/mac-arm64/Dodo\ Recorder.app
# Expected: "accepted" + "source=Notarized Developer ID"

# Check stapled ticket
stapler validate release/mac-arm64/Dodo\ Recorder.app
# Expected: "The validate action worked!"
```

---

### Security Notes

- Never commit `.env`, `certificate.p12`, or credentials to version control
- These files are already gitignored
- Backup certificate and passwords securely

### Build Timeout

**Problem:** Build times out before completing

**Solutions:**

1. **Check caching is working** - npm cache should be reused
2. **Verify runtime setup download connectivity** - first launch requires GitHub asset access
3. **Increase timeout in workflow file** (if needed)

### Windows Build Issues

**Problem:** Windows build fails

**Solutions:**

1. **Ensure FFmpeg is installed** - The app bundles `ffmpeg-static` via npm
2. **Check Node.js version** - Must be 18+
3. **Verify Windows is x64** - ARM64 is not currently supported

### Build Output Not Found

**Problem:** Build completes but no output files in `release/`

**Solutions:**

1. **Check the console output for errors**
2. **Verify `dist/` and `dist-electron/` directories exist**
3. **Ensure Vite build completed successfully**
4. **Check `electron-builder` configuration**

---

## Build Info File

Each build generates a `build-info.json` file in the project root with:

```json
{
  "commitHash": "abc1234",
  "commitFull": "abc1234def5678...",
  "branch": "main",
  "isDirty": false,
  "buildTime": "2024-01-30T10:48:00.000Z",
  "nodeVersion": "v18.19.0"
}
```

This file is read by the Electron app to display build information in the UI.

---

## Additional Resources

- **[User Guide](docs/user_guide.md)** - Complete feature documentation
- **[Architecture](docs/architecture.md)** - System design and technical implementation
- **[Logs and Debugging](docs/logs_and_debugging.md)** - Debugging guide
