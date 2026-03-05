#!/bin/bash
# Icon generation script for KiwiGen
# This script generates all required icon sizes for macOS and Windows from SVG source

set -e

# Source image (SVG)
SOURCE="src/assets/kiwi.svg"

# Check if source image exists
if [ ! -f "$SOURCE" ]; then
  echo "❌ Error: Source image not found at $SOURCE"
  exit 1
fi

echo "🎨 Generating icons for KiwiGen from SVG..."

# Check for ImageMagick (required for SVG processing)
if ! command -v magick &> /dev/null; then
  echo "❌ Error: ImageMagick is required but not installed"
  echo "   Install it with: brew install imagemagick"
  exit 1
fi

# Create temp and output directories
rm -rf build/icon.iconset build/temp-icon
mkdir -p build/icon.iconset build/temp-icon

# Step 1: Convert SVG to high-res PNG with white background
echo "📐 Converting SVG to base PNG with white background..."
magick -background white -density 1024 "$SOURCE" -resize 1024x1024 -flatten build/temp-icon/base.png

# Step 2: Generate macOS iconset sizes from the base PNG
echo "📐 Generating macOS iconset sizes..."
sips -z 16 16 build/temp-icon/base.png --out build/icon.iconset/icon_16x16.png
sips -z 32 32 build/temp-icon/base.png --out build/icon.iconset/icon_16x16@2x.png
sips -z 32 32 build/temp-icon/base.png --out build/icon.iconset/icon_32x32.png
sips -z 64 64 build/temp-icon/base.png --out build/icon.iconset/icon_64x64.png
sips -z 128 128 build/temp-icon/base.png --out build/icon.iconset/icon_128x128.png
sips -z 256 256 build/temp-icon/base.png --out build/icon.iconset/icon_256x256.png
sips -z 512 512 build/temp-icon/base.png --out build/icon.iconset/icon_256x256@2x.png
sips -z 512 512 build/temp-icon/base.png --out build/icon.iconset/icon_512x512.png
sips -z 1024 1024 build/temp-icon/base.png --out build/icon.iconset/icon_512x512@2x.png
sips -z 1024 1024 build/temp-icon/base.png --out build/icon.iconset/icon_1024x1024.png

# Step 3: Create .icns file for macOS
echo "🍎 Creating macOS .icns file..."
iconutil -c icns build/icon.iconset -o build/icon.icns

# Step 4: Generate Windows .ico with multiple sizes
echo "🪟 Generating Windows .ico file..."
magick build/temp-icon/base.png -define icon:auto-resize=256,128,96,64,48,32,16 build/icon.ico

# Cleanup
rm -rf build/temp-icon

echo ""
echo "✅ Icon generation complete!"
echo ""
echo "Generated files:"
echo "  - build/icon.icns (macOS)"
echo "  - build/icon.ico (Windows)"
echo ""
echo "Source: $SOURCE (SVG with white background)"
echo ""
echo "To rebuild the app with new icons, run:"
echo "  npm run build"
