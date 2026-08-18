#!/bin/bash
# pd-eff Windows Builder (run on Windows with Git Bash or WSL)
set -e

echo "🪟 pd-eff Windows Builder"
echo "========================="

PROJECT_ROOT="$(cd .. && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
DESKTOP_DIR="$(pwd)"

# 1. Build Python executable
echo ""
echo "📦 Building Python executable..."
cd "$BACKEND_DIR"
source venv/Scripts/activate 2>/dev/null || source venv/bin/activate

cat > run_desktop.py << 'PYEOF'
"""pd-eff Desktop entry point."""
import os, sys, uvicorn
port = int(os.environ.get('PORT', 8765))
print(f"Starting pd-eff on port {port}...")
uvicorn.run("pdf_signer.main:app", host="0.0.0.0", port=port)
PYEOF

pyinstaller --onefile --name pd-eff.exe \
  --distpath "$DESKTOP_DIR/dist/windows" \
  --workpath /tmp/pyinstaller \
  --clean \
  --add-data "pdf_signer;pdf_signer" \
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
DIST="$DESKTOP_DIR/dist/pd-eff-windows"
rm -rf "$DIST"
mkdir -p "$DIST"/{data/{uploads,signed,certs},pdf_signer}

cp "$DESKTOP_DIR/dist/windows/pd-eff.exe" "$DIST/"
cp -r "$BACKEND_DIR/pdf_signer/"* "$DIST/pdf_signer/"
mkdir -p "$DIST/data/uploads" "$DIST/data/signed" "$DIST/data/certs"

# 3. Create launcher
cat > "$DIST/pd-eff.bat" << 'LAUNCHER'
@echo off
cd /d "%~dp0"
set PORT=8765
echo 🔐 pd-eff — PDF Digital Signing
echo    Open http://localhost:8765 in your browser
echo.
start "" pd-eff.exe
timeout /t 3 /nobreak >nul
start http://localhost:8765
echo.
echo Press Ctrl+C to stop
pause >nul
taskkill /f /im pd-eff.exe 2>nul
LAUNCHER

# 4. Create README
cat > "$DIST/README.txt" << 'README'
pd-eff — Offline PDF Digital Signing (Windows)

QUICK START:
  Double-click pd-eff.bat
  Browser opens automatically to http://localhost:8765

FEATURES:
  - Draw-to-sign PDFs (like Adobe Acrobat)
  - Auto-detect USB digital keys
  - Signature verification
  - Works completely offline

USB KEY SETUP:
  1. Install OpenSC from https://opensc.org
  2. Plug in your USB key
  3. App auto-detects it

REQUIREMENTS:
  - Windows 10/11
  - OpenSC (for USB key support)
  - Browser (Edge, Chrome, Firefox)
README

# 5. Code signing (optional)
if [ -n "$SIGNTOOL_PATH" ]; then
  echo "🔐 Signing executable..."
  "$SIGNTOOL_PATH" sign /f "$SIGN_CERT" /p "$SIGN_PASS" "$DIST/pd-eff.exe" 2>&1
  echo "   Signed: pd-eff.exe"
elif command -v osslsigncode &>/dev/null; then
  echo "🔐 Signing with osslsigncode..."
  osslsigncode sign -certs "$SIGN_CERT" -pass "$SIGN_PASS" -in "$DIST/pd-eff.exe" -out "$DIST/pd-eff-signed.exe"
  mv "$DIST/pd-eff-signed.exe" "$DIST/pd-eff.exe" 2>/dev/null
  echo "   Signed: pd-eff.exe"
else
  echo "⚠️  No code signing tool found. Skipping signing."
  echo "   To sign, set SIGNTOOL_PATH or install osslsigncode."
fi

# 6. Create NSIS installer script
cat > "$DIST/installer.nsi" << 'NSIS'
!include "MUI2.nsh"

!define APPNAME "pd-eff"
!define VERSION "1.0.0"
!define PUBLISHER "pd-eff"
!define DESCRIPTION "Offline PDF Digital Signing"

Name "${APPNAME} v${VERSION}"
OutFile "pd-eff-setup.exe"
InstallDir $PROGRAMFILES\${APPNAME}
RequestExecutionLevel admin

# Modern UI
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

# Version info
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "${DESCRIPTION}"

Section "Install"
  SetOutPath $INSTDIR
  File /r "dist\pd-eff-windows\*.*"
  
  # Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortCut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\pd-eff.bat"
  CreateShortCut "$SMPROGRAMS\${APPNAME}\Uninstall.lnk" "$INSTDIR\uninstall.exe"
  
  # Desktop shortcut
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\pd-eff.bat"
  
  # Uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"
  
  # Add to Programs and Features
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "Publisher" "${PUBLISHER}"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}\Uninstall.lnk"
  RMDir "$SMPROGRAMS\${APPNAME}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
SectionEnd
NSIS

echo ""
echo "✅ Windows build complete!"
echo ""
echo "📁 Output: desktop/dist/pd-eff-windows/"
echo "📦 Installer: Run 'makensis installer.nsi' with NSIS installed"
echo ""
echo "To run:"
echo "  dist\\pd-eff-windows\\pd-eff.bat"
