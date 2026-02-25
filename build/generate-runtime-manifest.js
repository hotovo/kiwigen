#!/usr/bin/env node
/**
 * Generates runtime-manifest.json from one or more asset metadata files.
 *
 * Usage:
 *   node ./build/generate-runtime-manifest.js --metadata-dir release/runtime-assets --output release/runtime-assets/runtime-manifest.json
 */

const fs = require('fs');
const path = require('path');

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

function walkJsonFiles(rootDir) {
  const result = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.startsWith('asset-metadata.') && entry.name.endsWith('.json')) {
        result.push(fullPath);
      }
    }
  }

  return result.sort();
}

function assertArtifact(artifact, platform) {
  const requiredFields = ['id', 'version', 'url', 'sha256', 'type', 'targetPath'];
  for (const field of requiredFields) {
    if (!artifact[field]) {
      throw new Error(`Artifact field '${field}' missing for platform ${platform}`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const metadataDir = path.resolve(args['metadata-dir'] || path.join('release', 'runtime-assets'));
  const outputPath = path.resolve(args.output || path.join(metadataDir, 'runtime-manifest.json'));
  const requireBothPlatforms = args['require-platforms'] !== 'false';

  if (!fs.existsSync(metadataDir)) {
    throw new Error(`Metadata directory does not exist: ${metadataDir}`);
  }

  const metadataFiles = walkJsonFiles(metadataDir);
  if (metadataFiles.length === 0) {
    throw new Error(`No asset metadata files found in ${metadataDir}`);
  }

  const platforms = {};
  for (const metadataFile of metadataFiles) {
    const parsed = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
    const platform = parsed.platform;
    if (!platform) {
      throw new Error(`Metadata missing platform: ${metadataFile}`);
    }
    if (!Array.isArray(parsed.artifacts) || parsed.artifacts.length === 0) {
      throw new Error(`Metadata has no artifacts: ${metadataFile}`);
    }

    const artifacts = parsed.artifacts.map((artifact) => {
      assertArtifact(artifact, platform);
      return {
        id: artifact.id,
        version: artifact.version,
        url: artifact.url,
        sha256: artifact.sha256,
        type: artifact.type,
        targetPath: artifact.targetPath,
        executable: artifact.executable,
      };
    });

    platforms[platform] = { artifacts };
  }

  if (requireBothPlatforms) {
    const expected = ['darwin-arm64', 'win32-x64'];
    for (const platform of expected) {
      if (!platforms[platform]) {
        throw new Error(`Missing metadata for platform ${platform}`);
      }
    }
  }

  const manifest = {
    manifestVersion: 1,
    generatedAt: new Date().toISOString(),
    platforms,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

  console.log('✅ Runtime manifest generated');
  console.log(`   Output: ${outputPath}`);
  console.log(`   Platforms: ${Object.keys(platforms).join(', ')}`);
}

try {
  main();
} catch (error) {
  console.error('❌ Failed to generate runtime manifest');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
