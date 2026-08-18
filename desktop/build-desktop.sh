#!/bin/bash
# pd-eff Desktop App Builder
# Builds a standalone offline desktop application

set -e

echo "🔐 pd-eff Desktop Builder"
echo "========================"
echo ""

# Get project root
PROJECT_ROOT="$(cd .. && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
DESKTOP_DIR="$(pwd)"

# 1. Setup Python
 echo "📦 Step 1: Setting up Python backend..."
cd "$BACKEND_DIR"
if [ ! -d "venv" ]; then
    ~/.local/bin/uv venv --python 3.12 venv 2>/dev/null || python3 -m venv venv
fi
source venv/bin/activate
~/.local/bin/uv pip install -q -r requirements.txt pikepdf nest-asyncio pyinstaller 2>/dev/null || pip install -q -r requirements.txt pikepdf nest-asyncio pyinstaller
cd "$DESKTOP_DIR"

# 2. Build frontend
echo "📦 Step 2: Building frontend..."
cd "$FRONTEND_DIR"
npm install --legacy-peer-deps
npm run build
cd "$DESKTOP_DIR"

# 3. Build Python executable
echo "📦 Step 3: Building Python executable..."
cd "$BACKEND_DIR"
source venv/bin/activate

# Create PyInstaller spec
cat > pd-eff-api.spec << 'PYEOF'
# -*- mode: python ; coding: utf-8 -*-
block_cipher = None

a = Analysis(
    ['run.py'],
    pathex=[],
    binaries=[],
    datas=[('pdf_signer', 'pdf_signer')],
    hiddenimports=['pdf_signer', 'pdf_signer.main'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='pd-eff-api',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
PYEOF

pyinstaller --clean pd-eff-api.spec 2>&1 | tail -5
cd "$DESKTOP_DIR"

# 4. Create distribution directory
echo "📦 Step 4: Creating distribution..."
mkdir -p dist/app
cp -r "$FRONTEND_DIR/.next" dist/app/frontend-build/
cp -r "$BACKEND_DIR/dist/pd-eff-api" dist/app/ 2>/dev/null || cp "$BACKEND_DIR/dist/pd-eff-api" dist/app/
cp -r "$BACKEND_DIR/pdf_signer" dist/app/
cp -r "$BACKEND_DIR/data" dist/app/

# 5. Create launch script
cat > dist/app/start.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
PORT=8765 ./pd-eff-api &
sleep 3
echo ""
echo "✅ pd-eff is running!"
echo "   Open http://localhost:8765 in your browser"
echo ""
echo "Press Ctrl+C to stop"
wait
EOF
chmod +x dist/app/start.sh

# Windows batch file
cat > dist/app/start.bat << 'EOF'
@echo off
cd /d "%~dp0"
start "" pd-eff-api.exe
timeout /t 3 /nobreak >nul
echo.
echo ✅ pd-eff is running!
echo    Open http://localhost:8765 in your browser
echo.
echo Press any key to stop...
pause >nul
taskkill /f /im pd-eff-api.exe 2>nul
EOF

echo ""
echo "✅ Desktop app built successfully!"
echo ""
echo "📁 Distribution: $DESKTOP_DIR/dist/app/"
echo ""
echo "To run:"
echo "  cd dist/app && ./start.sh      # Linux/Mac"
echo "  dist\\app\\start.bat             # Windows"
echo ""
echo "To package as installer:"
echo "  cd desktop && npm run build     # Uses electron-builder"
echo ""
echo "Files in dist/app/:"
ls -la dist/app/ 2>/dev/null | head -15
