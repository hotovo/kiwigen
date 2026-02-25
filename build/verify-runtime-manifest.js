#!/usr/bin/env node
/**
 * Verifies runtime-manifest.json structure and optionally validates asset URLs.
 *
 * Usage:
 *   node ./build/verify-runtime-manifest.js --manifest release/runtime-assets/runtime-manifest.json
 *   node ./build/verify-runtime-manifest.js --manifest release/runtime-assets/runtime-manifest.json --check-urls true
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateManifestShape(manifest) {
  assert(manifest && typeof manifest === 'object', 'Manifest must be an object');
  assert(manifest.manifestVersion === 1, 'Manifest version must be 1');
  assert(manifest.platforms && typeof manifest.platforms === 'object', 'Manifest must include platforms');

  for (const [platform, entry] of Object.entries(manifest.platforms)) {
    assert(entry && Array.isArray(entry.artifacts), `Platform '${platform}' must define artifacts[]`);
    for (const artifact of entry.artifacts) {
      assert(typeof artifact.id === 'string', `Artifact id missing for ${platform}`);
      assert(typeof artifact.version === 'string', `Artifact version missing for ${platform}/${artifact.id}`);
      assert(typeof artifact.url === 'string' && artifact.url.startsWith('https://'), `Artifact URL invalid for ${platform}/${artifact.id}`);
      assert(typeof artifact.sha256 === 'string' && artifact.sha256.length === 64, `Artifact SHA256 invalid for ${platform}/${artifact.id}`);
      assert(artifact.type === 'file' || artifact.type === 'zip', `Artifact type invalid for ${platform}/${artifact.id}`);
      assert(typeof artifact.targetPath === 'string', `Artifact targetPath missing for ${platform}/${artifact.id}`);
    }
  }
}

function fetchStatus(url, redirects = 0) {
  if (redirects > 5) {
    return Promise.reject(new Error(`Too many redirects: ${url}`));
  }

  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'HEAD' }, (res) => {
      const statusCode = res.statusCode || 0;
      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        const redirectedUrl = new URL(res.headers.location, url).toString();
        res.resume();
        fetchStatus(redirectedUrl, redirects + 1).then(resolve).catch(reject);
        return;
      }

      res.resume();
      resolve(statusCode);
    });

    req.on('error', reject);
    req.end();
  });
}

async function verifyUrls(manifest) {
  const failures = [];

  for (const [platform, entry] of Object.entries(manifest.platforms)) {
    for (const artifact of entry.artifacts) {
      const status = await fetchStatus(artifact.url);
      if (status < 200 || status >= 300) {
        failures.push(`${platform}/${artifact.id} -> HTTP ${status}`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Runtime manifest URL check failed:\n${failures.join('\n')}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(args.manifest || path.join('release', 'runtime-assets', 'runtime-manifest.json'));
  const checkUrls = args['check-urls'] === 'true';

  assert(fs.existsSync(manifestPath), `Manifest not found: ${manifestPath}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  validateManifestShape(manifest);

  if (checkUrls) {
    await verifyUrls(manifest);
  }

  console.log('✅ Runtime manifest verification passed');
  console.log(`   Manifest: ${manifestPath}`);
  console.log(`   URL check: ${checkUrls ? 'enabled' : 'disabled'}`);
}

main().catch((error) => {
  console.error('❌ Runtime manifest verification failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
