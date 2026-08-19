#!/bin/bash
# pd-eff Electron Builder — builds deb, rpm, AppImage, NSIS, portable
set -e

cd "$(dirname "$0")"

echo "╔══════════════════════════════════════════╗"
echo "║     pd-eff Electron Builder              ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Step 1: Build the frontend
echo "📦 Step 1: Building frontend..."
cd ../frontend
if [ ! -d "node_modules" ]; then
    echo "  Installing frontend dependencies..."
    npm install
fi
echo "  Building Next.js..."
npm run build
echo "  ✅ Frontend built"
cd ../desktop

# Step 2: Generate icons
echo ""
echo "🎨 Step 2: Generating icons..."
bash generate-icons.sh

# Step 3: Install Electron dependencies
echo ""
echo "📥 Step 3: Installing Electron dependencies..."
if [ ! -d "node_modules" ]; then
    npm install
fi

# Check for electron-builder
if ! npx electron-builder --version &>/dev/null; then
    echo "  Installing electron-builder..."
    npm install electron-builder --save-dev
fi
echo "  ✅ Dependencies ready"

# Step 4: Build for current platform (or specify TARGET)
echo ""
echo "🔨 Step 4: Building Electron packages..."

TARGET="${1:-all}"

case "$TARGET" in
    linux)
        echo "  Building Linux packages (deb + rpm + AppImage)..."
        npx electron-builder --linux deb rpm AppImage --x64
        ;;
    deb)
        echo "  Building .deb package..."
        npx electron-builder --linux deb --x64
        ;;
    rpm)
        echo "  Building .rpm package..."
        npx electron-builder --linux rpm --x64
        ;;
    appimage)
        echo "  Building AppImage..."
        npx electron-builder --linux AppImage --x64
        ;;
    win|windows)
        echo "  Building Windows packages (NSIS + portable)..."
        npx electron-builder --win nsis portable --x64
        ;;
    all)
        echo "  Building ALL packages..."
        npx electron-builder --linux deb rpm AppImage --x64
        echo ""
        echo "  ⚠️  Windows builds can only be created on Windows or in CI"
        ;;
    *)
        echo "  Unknown target: $TARGET"
        echo "  Usage: $0 [linux|deb|rpm|appimage|win|all]"
        exit 1
        ;;
esac

echo ""
echo "✅ Build complete!"
echo ""
echo "Output files:"

# Show output files
if [ -d "dist/electron" ]; then
    echo ""
    echo "📁 dist/electron/"
    ls -lh dist/electron/*.{deb,rpm,AppImage,exe,zip} 2>/dev/null || echo "  (no packages found)"
fi

echo ""
echo "To install:"
echo "  deb:   sudo dpkg -i dist/electron/*.deb"
echo "  rpm:   sudo rpm -i dist/electron/*.rpm"
echo "  AppImage: chmod +x dist/electron/*.AppImage && ./dist/electron/*.AppImage"
