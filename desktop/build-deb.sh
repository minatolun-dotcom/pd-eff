#!/bin/bash
# pd-eff .deb Package Builder
set -e

echo "📦 pd-eff .deb Builder"
echo "======================"

DESKTOP_DIR="$(pwd)"
DIST_DIR="$DESKTOP_DIR/dist"
DEB_DIR="$DIST_DIR/pd-eff_1.0.0_amd64"

# 1. Check if Linux build exists
if [ ! -f "$DIST_DIR/pd-eff-linux/pd-eff-server" ]; then
    echo "❌ Linux build not found. Run build-linux.sh first."
    exit 1
fi

# 2. Create .deb structure
echo ""
echo "📦 Creating .deb structure..."
rm -rf "$DEB_DIR"
mkdir -p "$DEB_DIR/DEBIAN"
mkdir -p "$DEB_DIR/usr/bin"
mkdir -p "$DEB_DIR/usr/share/pd-eff"
mkdir -p "$DEB_DIR/usr/share/applications"
mkdir -p "$DEB_DIR/usr/share/icons/hicolor/256x256/apps"

# 3. Copy files
echo "📦 Copying files..."
cp "$DIST_DIR/pd-eff-linux/pd-eff-server" "$DEB_DIR/usr/share/pd-eff/"
cp -r "$DIST_DIR/pd-eff-linux/pdf_signer" "$DEB_DIR/usr/share/pd-eff/"
mkdir -p "$DEB_DIR/usr/share/pd-eff/data/"{uploads,signed,certs}
touch "$DEB_DIR/usr/share/pd-eff/data/uploads/.gitkeep"
touch "$DEB_DIR/usr/share/pd-eff/data/signed/.gitkeep"
touch "$DEB_DIR/usr/share/pd-eff/data/certs/.gitkeep"

# 4. Create launcher script
cat > "$DEB_DIR/usr/bin/pd-eff" << 'LAUNCHER'
#!/bin/bash
cd /usr/share/pd-eff
export PORT=8765
./pd-eff-server &
PID=$!
sleep 2
xdg-open http://localhost:8765 2>/dev/null
trap "kill $PID 2>/dev/null" EXIT
wait
LAUNCHER
chmod +x "$DEB_DIR/usr/bin/pd-eff"

# 5. Create .desktop file
cat > "$DEB_DIR/usr/share/applications/pd-eff.desktop" << 'DESKTOP'
[Desktop Entry]
Name=pd-eff
Comment=PDF Digital Signing Application
Exec=pd-eff
Icon=pd-eff
Terminal=false
Type=Application
Categories=Office;Utility;
StartupWMClass=pd-eff
DESKTOP

# 6. Create control file
cat > "$DEB_DIR/DEBIAN/control" << CONTROL
Package: pd-eff
Version: 1.0.0
Section: utils
Priority: optional
Architecture: amd64
Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, opensc
Maintainer: pd-eff <noreply@github.com>
Description: PDF Digital Signing Application
 pd-eff is an offline PDF digital signing application.
 Sign PDFs with USB digital keys, verify signatures,
 and manage certificates. Works completely offline.
 .
 Features:
  - Draw-to-sign PDF placement
  - USB key auto-detection (PKCS#11)
  - Signature verification
  - Certificate management
  - Tamper detection
CONTROL

# 7. Build .deb
echo ""
echo "📦 Building .deb package..."
dpkg-deb --build "$DEB_DIR" "$DIST_DIR/pd-eff_1.0.0_amd64.deb"

echo ""
echo "✅ .deb package built!"
echo ""
echo "📁 Output: desktop/dist/pd-eff_1.0.0_amd64.deb"
echo ""
echo "To install:"
echo "  sudo dpkg -i pd-eff_1.0.0_amd64.deb"
echo "  sudo apt-get install -f  # fix dependencies if needed"
echo ""
echo "To run:"
echo "  pd-eff"
echo "  # Opens http://localhost:8765"
echo ""
echo "To uninstall:"
echo "  sudo dpkg -r pd-eff"
