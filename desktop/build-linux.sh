#!/bin/bash
# pd-eff Linux Builder
set -e

echo "🐧 pd-eff Linux Builder"
echo "======================="

PROJECT_ROOT="$(cd .. && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
DESKTOP_DIR="$(pwd)"

# 1. Build Python executable
echo ""
echo "📦 Building Python executable..."
cd "$BACKEND_DIR"
source venv/bin/activate

cat > run_desktop.py << 'PYEOF'
"""pd-eff Desktop entry point."""
import os, sys, uvicorn
port = int(os.environ.get('PORT', 8765))
print(f"Starting pd-eff on port {port}...")
uvicorn.run("pdf_signer.main:app", host="0.0.0.0", port=port)
PYEOF

pyinstaller --onefile --name pd-eff \
  --distpath "$DESKTOP_DIR/dist/linux" \
  --workpath /tmp/pyinstaller \
  --clean \
  --add-data "pdf_signer:pdf_signer" \
  --hidden-import pdf_signer --hidden-import pdf_signer.main \
  --hidden-import pdf_signer.database --hidden-import pdf_signer.signing_service \
  --hidden-import pdf_signer.verification_service --hidden-import pdf_signer.cert_utils \
  --hidden-import pdf_signer.config --hidden-import pdf_signer.pkcs11_service \
  --hidden-import uvicorn --hidden-import uvicorn.logging \
  --hidden-import uvicorn.loops --hidden-import uvicorn.loops.auto \
  --hidden-import uvicorn.protocols --hidden-import uvicorn.protocols.http \
  --hidden-import uvicorn.protocols.http.auto --hidden-import uvicorn.protocols.websockets \
  --hidden-import uvicorn.protocols.websockets.auto --hidden-import uvicorn.lifespan \
  --hidden-import uvicorn.lifespan.on \
  run_desktop.py 2>&1 | tail -3

# 2. Create distribution
echo ""
echo "📦 Creating distribution..."
DIST="$DESKTOP_DIR/dist/pd-eff-linux"
rm -rf "$DIST"
mkdir -p "$DIST"/{data/{uploads,signed,certs},pdf_signer}

cp "$DESKTOP_DIR/dist/linux/pd-eff" "$DIST/"
chmod +x "$DIST/pd-eff"
cp -r "$BACKEND_DIR/pdf_signer/"* "$DIST/pdf_signer/"
touch "$DIST/data/uploads/.gitkeep" "$DIST/data/signed/.gitkeep" "$DIST/data/certs/.gitkeep"

# 3. Create launcher
# Binary is already named pd-eff, create a wrapper with different name
mv "$DIST/pd-eff" "$DIST/pd-eff-server"
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
xdg-open http://localhost:8765 2>/dev/null || echo "Open http://localhost:8765 manually"
trap "kill $PID 2>/dev/null" EXIT
wait
LAUNCHER
chmod +x "$DIST/pd-eff"

# 4. Create README
cat > "$DIST/README.txt" << 'README'
pd-eff — Offline PDF Digital Signing (Linux)

QUICK START:
  ./pd-eff
  Then open http://localhost:8765

FEATURES:
  - Draw-to-sign PDFs (like Adobe Acrobat)
  - Auto-detect USB digital keys
  - Signature verification
  - Works completely offline

USB KEY SETUP:
  sudo apt install opensc
  Then plug in your USB key

REQUIREMENTS:
  - OpenSC (for USB key support)
  - Browser (Firefox, Chrome, etc.)
README

# 5. Create tar.gz
echo ""
echo "📦 Creating archive..."
cd "$DESKTOP_DIR/dist"
tar -czf pd-eff-linux-x64.tar.gz pd-eff-linux/

echo ""
echo "✅ Linux build complete!"
echo ""
echo "📁 Output: desktop/dist/pd-eff-linux/"
echo "📦 Archive: desktop/dist/pd-eff-linux-x64.tar.gz"
echo ""
echo "To run:"
echo "  cd dist/pd-eff-linux && ./pd-eff"
