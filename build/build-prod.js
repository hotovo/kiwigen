#!/usr/bin/env node
/**
 * Production build script for Electron
 * Detects the current platform and runs the appropriate electron-builder command
 * with full signing and notarization for production releases
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Detect platform early (used throughout the script)
const platform = process.platform;

// Load .env file if it exists (for signing credentials)
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  console.log('📋 Loading environment variables from .env file...');
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) return;
    
    // Parse KEY="VALUE" or KEY=VALUE format
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
} else if (process.platform === 'darwin') {
  console.warn('⚠️  Warning: .env file not found. macOS builds will not be signed/notarized.');
  console.warn('    Copy .env.example to .env and fill in your Apple Developer credentials.');
}

// Generate build info first
console.log('📝 Generating build info...');
execSync('node ./build/generate-build-info.js .', { stdio: 'inherit' });

// Build frontend with Vite
console.log('🏗️  Building frontend...');
execSync('npx vite build', { stdio: 'inherit' });

// Copy Windows icon to dist-electron for runtime use
if (platform === 'win32') {
  console.log('🎨 Copying Windows icon to dist-electron...');
  const iconSource = path.join(process.cwd(), 'build', 'icon.ico');
  const iconDest = path.join(process.cwd(), 'dist-electron', 'icon.ico');
  fs.copyFileSync(iconSource, iconDest);
  console.log('   ✅ Icon copied to dist-electron/icon.ico');
}

// Determine platform-specific electron-builder arguments
let builderArgs = '--config electron-builder.json --publish never';

console.log(`🔨 Building for platform: ${platform}`);

if (platform === 'darwin') {
  // macOS - with signing and notarization (ARM64 only)
  builderArgs += ' --mac --arm64';
} else if (platform === 'win32') {
  // Windows x64
  builderArgs += ' --win --x64';
} else {
  console.error(`Unsupported platform: ${platform}`);
  process.exit(1);
}

// Verify macOS signing/notarization setup
if (platform === 'darwin') {
  console.log('\n🔐 macOS Signing & Notarization Setup:');
  console.log(`   APPLE_ID: ${process.env.APPLE_ID ? '✅ Set' : '❌ Not set'}`);
  console.log(`   APPLE_APP_SPECIFIC_PASSWORD: ${process.env.APPLE_APP_SPECIFIC_PASSWORD ? '✅ Set' : '❌ Not set'}`);
  console.log(`   APPLE_TEAM_ID: ${process.env.APPLE_TEAM_ID ? '✅ Set' : '❌ Not set'}`);
  
  // Code signing method detection
  if (process.env.CSC_LINK) {
    console.log(`   CSC_LINK: ✅ Set (explicit .p12 certificate)`);
    console.log(`   CSC_KEY_PASSWORD: ${process.env.CSC_KEY_PASSWORD ? '✅ Set' : '❌ Not set'}`);
  } else if (process.env.CSC_NAME) {
    console.log(`   CSC_NAME: ✅ Set (explicit certificate: ${process.env.CSC_NAME})`);
  } else {
    console.log(`   CSC_LINK/CSC_NAME: ⚠️  Not set (will auto-discover from Keychain)`);
    console.log(`   ⚠️  If signing fails, set CSC_LINK + CSC_KEY_PASSWORD in .env`);
  }
  
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.error('\n❌ ERROR: Missing Apple credentials for notarization!');
    console.error('   The app will be signed but NOT notarized.');
    console.error('   Users will see "macOS cannot verify that this app is free from malware"');
    console.error('\n   To fix: Copy .env.example to .env and fill in your Apple Developer credentials.\n');
    // Don't fail, but warn loudly
  }
  
  console.log('');
}

// Run electron-builder
console.log(`🚀 Running electron-builder with args: ${builderArgs}`);
try {
  execSync(`npx electron-builder ${builderArgs}`, {
    stdio: 'inherit',
    env: process.env  // Explicitly pass environment variables
  });
  console.log('\n✅ Production build completed successfully!');
  
  if (platform === 'darwin' && (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID)) {
    console.log('✅ App should be signed and notarized');
  } else if (platform === 'darwin') {
    console.warn('⚠️  App is signed but NOT notarized - users will see security warnings');
  }
} catch (error) {
  console.error('❌ Build failed');
  process.exit(1);
}
