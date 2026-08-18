#!/bin/bash
# pd-eff Universal Linux Builder
set -e

echo "🐧 pd-eff Universal Linux Builder"
echo "================================="

DESKTOP_DIR="$(pwd)"
DIST="$DESKTOP_DIR/dist/pd-eff-linux-x64"

# Check if Linux build exists
if [ ! -f "$DESKTOP_DIR/dist/pd-eff-linux/pd-eff-server" ]; then
    echo "❌ Linux build not found. Run build-linux.sh first."
    exit 1
fi

# Create clean distribution
rm -rf "$DIST"
mkdir -p "$DIST"

# Copy files
cp "$DESKTOP_DIR/dist/pd-eff-linux/pd-eff-server" "$DIST/"
chmod +x "$DIST/pd-eff-server"

# Create launcher
cat > "$DIST/pd-eff" << 'LAUNCHER'
#!/bin/bash
cd "$(dirname "$0")"
export PORT=8765

echo "🔐 pd-eff — PDF Digital Signing"
echo "   Open http://localhost:8765 in your browser"
echo ""

./pd-eff-server &
PID=$!
sleep 2

# Try to open browser
if command -v xdg-open &>/dev/null; then
    xdg-open http://localhost:8765 2>/dev/null &
elif command -v open &>/dev/null; then
    open http://localhost:8765 2>/dev/null &
fi

trap "kill $PID 2>/dev/null; exit" INT TERM
wait $PID
LAUNCHER
chmod +x "$DIST/pd-eff"

# Create uninstall script
cat > "$DIST/uninstall.sh" << 'UNINSTALL'
#!/bin/bash
echo "Uninstalling pd-eff..."
rm -rf "$(dirname "$0")"
echo "✅ pd-eff has been removed."
UNINSTALL
chmod +x "$DIST/uninstall.sh"

# Create README
cat > "$DIST/README.md" << 'README'
# pd-eff — Offline PDF Digital Signing

## Quick Start

```bash
./pd-eff
```

Then open **http://localhost:8765** in your browser.

## Features

- ✍️ **Draw-to-sign** — Draw a rectangle on the PDF where you want the signature
- 🔐 **USB Key Auto-Detect** — Automatically detects plugged-in PKCS#11 tokens
- ✅ **Signature Verification** — Validate signatures like Adobe Acrobat
- 📜 **Certificate Manager** — Generate self-signed certs for testing
- 🛡️ **Tamper Detection** — Detect any modification to signed documents
- 💻 **100% Offline** — No internet connection needed

## USB Key Setup

Install OpenSC for your distribution:

```bash
# Ubuntu/Debian
sudo apt install opensc

# Fedora/RHEL
sudo dnf install opensc

# Arch
sudo pacman -S opensc
```

Then plug in your USB digital key — pd-eff auto-detects it!

## System Requirements

- Linux x86_64
- OpenSC (for USB key support)
- Any modern browser (Firefox, Chrome, Edge)

## Uninstall

```bash
./uninstall.sh
```

## License

MIT
README

# Create tar.gz archive
echo ""
echo "📦 Creating archive..."
cd "$DESKTOP_DIR/dist"
tar -czf pd-eff-linux-x64.tar.gz pd-eff-linux-x64/

echo ""
echo "✅ Universal Linux build complete!"
echo ""
echo "📁 Distribution: desktop/dist/pd-eff-linux-x64/"
echo "📦 Archive: desktop/dist/pd-eff-linux-x64.tar.gz"
echo ""
echo "To distribute:"
echo "  Share pd-eff-linux-x64.tar.gz"
echo "  Recipient: tar -xzf pd-eff-linux-x64.tar.gz && cd pd-eff-linux-x64 && ./pd-eff"
echo ""
du -sh pd-eff-linux-x64/
du -sh pd-eff-linux-x64.tar.gz
