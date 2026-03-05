#!/usr/bin/env node
/**
 * Packages runtime dependencies into release assets for a specific platform.
 *
 * Usage:
 *   node ./build/package-runtime-assets.js --platform darwin-arm64 --release-tag v0.4.0 --output release/runtime-assets/darwin-arm64
 *   node ./build/package-runtime-assets.js --platform win32-x64 --release-tag v0.4.0 --output release/runtime-assets/win32-x64
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    args[key] = value;
  }
  return args;
}

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} not found at ${targetPath}`);
  }
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function sha256File(targetPath) {
  const hash = crypto.createHash('sha256');
  const content = fs.readFileSync(targetPath);
  hash.update(content);
  return hash.digest('hex');
}

function fileSize(targetPath) {
  return fs.statSync(targetPath).size;
}

function copyFile(fromPath, toPath) {
  ensureDir(path.dirname(toPath));
  fs.copyFileSync(fromPath, toPath);
}

function zipChromium({ platform, playwrightDir, chromiumFolderName, zipPath }) {
  const chromiumPath = path.join(playwrightDir, chromiumFolderName);
  ensureExists(chromiumPath, 'Chromium folder');

  if (platform === 'darwin-arm64') {
    execSync(`zip -qry "${zipPath}" "${chromiumFolderName}"`, {
      cwd: playwrightDir,
      stdio: 'inherit',
    });
    return;
  }

  if (platform === 'win32-x64') {
    const escapedSource = chromiumPath.replace(/'/g, "''");
    const escapedDestination = zipPath.replace(/'/g, "''");
    const command = `Compress-Archive -Path '${escapedSource}' -DestinationPath '${escapedDestination}' -Force`;
    execSync(`powershell -NoProfile -Command "${command}"`, { stdio: 'inherit' });
    return;
  }

  throw new Error(`Unsupported platform for zipping Chromium: ${platform}`);
}

function findChromiumFolder(playwrightDir) {
  const entries = fs.readdirSync(playwrightDir, { withFileTypes: true });
  const chromiumDirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium-'))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  if (chromiumDirs.length === 0) {
    throw new Error(`No chromium-* directory found in ${playwrightDir}`);
  }

  return chromiumDirs[0];
}

function artifactUrl(repo, releaseTag, fileName) {
  return `https://github.com/${repo}/releases/download/${releaseTag}/${fileName}`;
}

const WHISPER_WIN_DLLS = [
  'whisper.dll',
  'ggml.dll',
  'ggml-cpu.dll',
  'ggml-base.dll',
  'SDL2.dll',
];

function packageWhisperWin32({ modelsWinDir, outputDir, binaryFileName }) {
  const tempDir = path.join(outputDir, '.tmp-whisper-win');
  ensureDir(tempDir);

  const exeSource = path.join(modelsWinDir, 'whisper-cli.exe');
  ensureExists(exeSource, 'Whisper CLI executable');

  copyFile(exeSource, path.join(tempDir, 'whisper-cli.exe'));

  WHISPER_WIN_DLLS.forEach((dllName) => {
    const dllSource = path.join(modelsWinDir, dllName);
    if (fs.existsSync(dllSource)) {
      copyFile(dllSource, path.join(tempDir, dllName));
    } else {
      console.warn(`Warning: ${dllName} not found in ${modelsWinDir}, skipping`);
    }
  });

  const zipPath = path.join(outputDir, binaryFileName);
  const escapedSource = tempDir.replace(/'/g, "''");
  const escapedDestination = zipPath.replace(/'/g, "''");
  const command = `Compress-Archive -Path '${escapedSource}\\*' -DestinationPath '${escapedDestination}' -Force`;
  execSync(`powershell -NoProfile -Command "${command}"`, { stdio: 'inherit' });

  fs.rmSync(tempDir, { recursive: true, force: true });

  return zipPath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const platform = args.platform;
  const releaseTag = args['release-tag'];
  const outputDir = path.resolve(args.output || path.join('release', 'runtime-assets', platform || 'unknown'));
  const repo = args.repo || 'dodosaurus/dodo-recorder';
  const playwrightDir = path.resolve(args['playwright-dir'] || 'playwright-browsers');
  const modelPath = path.resolve(args['model-path'] || path.join('models', 'ggml-small.en.bin'));

  if (!platform || (platform !== 'darwin-arm64' && platform !== 'win32-x64')) {
    throw new Error('--platform must be one of: darwin-arm64, win32-x64');
  }

  if (!releaseTag || !releaseTag.startsWith('v')) {
    throw new Error('--release-tag is required and must look like v0.4.0');
  }

  const whisperBinarySource = platform === 'darwin-arm64'
    ? path.resolve(path.join('models', 'unix', 'whisper'))
    : path.resolve(path.join('models', 'win', 'whisper-cli.exe'));

  ensureExists(modelPath, 'Whisper model');
  ensureExists(whisperBinarySource, 'Whisper binary');
  ensureExists(playwrightDir, 'Playwright browsers directory');

  const chromiumFolderName = findChromiumFolder(playwrightDir);

  ensureDir(outputDir);

  const modelFileName = 'kiwigen-runtime-whisper-model-small.en.bin';
  const binaryFileName = platform === 'darwin-arm64'
    ? 'kiwigen-runtime-whisper-binary-darwin-arm64'
    : 'kiwigen-runtime-whisper-binary-win32-x64.zip';
  const chromiumZipFileName = `kiwigen-runtime-playwright-${platform}-${chromiumFolderName}.zip`;

  const modelOutputPath = path.join(outputDir, modelFileName);
  const binaryOutputPath = path.join(outputDir, binaryFileName);
  const chromiumZipOutputPath = path.join(outputDir, chromiumZipFileName);

  copyFile(modelPath, modelOutputPath);

  if (platform === 'win32-x64') {
    packageWhisperWin32({
      modelsWinDir: path.resolve(path.join('models', 'win')),
      outputDir,
      binaryFileName,
    });
  } else {
    copyFile(whisperBinarySource, binaryOutputPath);
  }

  zipChromium({
    platform,
    playwrightDir,
    chromiumFolderName,
    zipPath: chromiumZipOutputPath,
  });

  const versionSuffix = releaseTag.replace(/^v/, '');
  const metadata = {
    platform,
    releaseTag,
    generatedAt: new Date().toISOString(),
    artifacts: [
      {
        id: 'whisper-model',
        version: `small.en-${versionSuffix}`,
        url: artifactUrl(repo, releaseTag, modelFileName),
        sha256: sha256File(modelOutputPath),
        type: 'file',
        targetPath: 'models/ggml-small.en.bin',
        fileName: modelFileName,
        size: fileSize(modelOutputPath),
      },
      {
        id: 'whisper-binary',
        version: `whispercpp-${versionSuffix}`,
        url: artifactUrl(repo, releaseTag, binaryFileName),
        sha256: sha256File(binaryOutputPath),
        type: platform === 'darwin-arm64' ? 'file' : 'zip',
        targetPath: platform === 'darwin-arm64' ? 'models/unix/whisper' : 'models/win',
        executable: platform === 'darwin-arm64',
        fileName: binaryFileName,
        size: fileSize(binaryOutputPath),
      },
      {
        id: 'playwright-chromium',
        version: chromiumFolderName,
        url: artifactUrl(repo, releaseTag, chromiumZipFileName),
        sha256: sha256File(chromiumZipOutputPath),
        type: 'zip',
        targetPath: 'playwright-browsers',
        fileName: chromiumZipFileName,
        size: fileSize(chromiumZipOutputPath),
      },
    ],
  };

  const metadataPath = path.join(outputDir, `asset-metadata.${platform}.json`);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  console.log('✅ Runtime assets packaged successfully');
  console.log(`   Platform: ${platform}`);
  console.log(`   Release tag: ${releaseTag}`);
  console.log(`   Output: ${outputDir}`);
  console.log(`   Metadata: ${metadataPath}`);
}

try {
  main();
} catch (error) {
  console.error('❌ Failed to package runtime assets');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
