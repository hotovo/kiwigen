#!/bin/bash
# Icon generation script for KiwiGen
# Generates macOS (.icns) and Windows (.ico) icons from PNG source

set -e

SOURCE="src/assets/kiwi.png"

# Check if source exists
if [ ! -f "$SOURCE" ]; then
  echo "❌ Error: Source image not found at $SOURCE"
  exit 1
fi

echo "🎨 Generating icons for KiwiGen from PNG source..."

# Check for sips (macOS built-in) and ImageMagick
if ! command -v sips &> /dev/null; then
  echo "❌ Error: sips command not found (required on macOS)"
  exit 1
fi

if ! command -v magick &> /dev/null; then
  echo "❌ Error: ImageMagick is required but not installed"
  echo "   Install it with: brew install imagemagick"
  exit 1
fi

# Verify source is a valid image
echo "🔍 Verifying source image..."
if ! file "$SOURCE" | grep -q "PNG image data"; then
  echo "❌ Error: Source is not a valid PNG image"
  exit 1
fi

# Create directories
rm -rf build/icon.iconset build/temp-icon
mkdir -p build/icon.iconset build/temp-icon

# Create a high-res base from the source PNG
echo "📐 Preparing base image (1024x1024)..."
sips -z 1024 1024 "$SOURCE" --out build/temp-icon/base.png > /dev/null

# Generate macOS iconset sizes (Apple HIG compliant)
echo "📐 Generating macOS iconset sizes..."
sips -z 16 16 build/temp-icon/base.png --out build/icon.iconset/icon_16x16.png > /dev/null
sips -z 32 32 build/temp-icon/base.png --out build/icon.iconset/icon_16x16@2x.png > /dev/null
sips -z 32 32 build/temp-icon/base.png --out build/icon.iconset/icon_32x32.png > /dev/null
sips -z 64 64 build/temp-icon/base.png --out build/icon.iconset/icon_64x64.png > /dev/null
sips -z 128 128 build/temp-icon/base.png --out build/icon.iconset/icon_128x128.png > /dev/null
sips -z 256 256 build/temp-icon/base.png --out build/icon.iconset/icon_256x256.png > /dev/null
sips -z 512 512 build/temp-icon/base.png --out build/icon.iconset/icon_256x256@2x.png > /dev/null
sips -z 512 512 build/temp-icon/base.png --out build/icon.iconset/icon_512x512.png > /dev/null
sips -z 1024 1024 build/temp-icon/base.png --out build/icon.iconset/icon_512x512@2x.png > /dev/null

# Create .icns for macOS
echo "🍎 Creating macOS .icns file..."
iconutil -c icns build/icon.iconset -o build/icon.icns

# Create .ico for Windows with multiple sizes
echo "🪟 Creating Windows .ico file..."
magick build/temp-icon/base.png \
       -define icon:auto-resize=256,128,96,64,48,32,16 \
       build/icon.ico

# Cleanup
rm -rf build/temp-icon

echo ""
echo "✅ Icon generation complete!"
echo ""
echo "Generated files:"
echo "  - build/icon.icns (macOS) - $(ls -lh build/icon.icns | awk '{print $5}')"
echo "  - build/icon.ico (Windows) - $(ls -lh build/icon.ico | awk '{print $5}')"
echo ""
echo "Source: $SOURCE (512x512 PNG)"
echo ""
echo "To rebuild the app with new icons, run:"
echo "  npm run build"
