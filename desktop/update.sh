#!/bin/bash
# pd-eff Auto-Updater (Standalone)
# Checks GitHub for new versions, verifies checksums, and downloads them.

set -e

GITHUB_REPO="minatolun-dotcom/pdf-eff"
CURRENT_VERSION="${PDEFF_VERSION:-1.1.0}"
INSTALL_DIR="${1:-$(dirname "$0")}"

echo "🔍 pd-eff Auto-Updater"
echo "======================"
echo "Current version: v$CURRENT_VERSION"
echo "Install dir: $INSTALL_DIR"
echo ""

# Detect platform
ARCH=$(uname -m 2>/dev/null || echo "x86_64")
OS=$(uname -s 2>/dev/null || echo "Linux")

if [ "$OS" = "Linux" ] && [ "$ARCH" = "x86_64" ]; then
  ASSET_NAME="pd-eff-linux-x64.tar.gz"
elif [ "$OS" = "Linux" ] && [ "$ARCH" = "aarch64" ]; then
  ASSET_NAME="pd-eff-linux-arm64.tar.gz"
elif [[ "$OS" == MINGW* ]] || [[ "$OS" == CYGWIN* ]] || [[ "$OS" == MSYS* ]]; then
  ASSET_NAME="pd-eff-windows.zip"
  OS="Windows"
else
  echo "⚠️  Auto-update not available for $OS $ARCH"
  echo "   Download manually from: https://github.com/$GITHUB_REPO/releases/latest"
  exit 1
fi

echo "Platform: $OS $ARCH"
echo "Asset: $ASSET_NAME"
echo ""

# Check for updates
echo "Checking for updates..."
RELEASE_JSON=$(curl -s --connect-timeout 10 "https://api.github.com/repos/$GITHUB_REPO/releases/latest" 2>/dev/null || echo "{}")

if ! echo "$RELEASE_JSON" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
  echo "⚠️  Could not check for updates (network error)"
  exit 1
fi

LATEST_VERSION=$(echo "$RELEASE_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tag_name','v0.0.0').lstrip('v'))" 2>/dev/null || echo "0.0.0")
RELEASE_URL=$(echo "$RELEASE_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('html_url',''))" 2>/dev/null || echo "")

echo "Latest version: v$LATEST_VERSION"
echo "Release URL: $RELEASE_URL"
echo ""

# Compare versions
if [ "$LATEST_VERSION" = "$CURRENT_VERSION" ]; then
  echo "✅ You are up to date! (v$CURRENT_VERSION)"
  exit 0
fi

NEWER=$(python3 -c "
v1 = [int(x) for x in '$LATEST_VERSION'.split('.')]
v2 = [int(x) for x in '$CURRENT_VERSION'.split('.')]
for i in range(max(len(v1), len(v2))):
    a = v1[i] if i < len(v1) else 0
    b = v2[i] if i < len(v2) else 0
    if a > b: print('yes'); break
    elif a < b: print('no'); break
else: print('no')
" 2>/dev/null || echo "no")

if [ "$NEWER" != "yes" ]; then
  echo "✅ You have the latest version! (v$CURRENT_VERSION)"
  exit 0
fi

echo "🚀 New version available: v$LATEST_VERSION"
echo ""

# Show release notes
RELEASE_BODY=$(echo "$RELEASE_JSON" | python3 -c "
import json, sys
body = json.load(sys.stdin).get('body', '')
lines = body.split('\n')[:15]
print('\n'.join(lines))
" 2>/dev/null || echo "")

if [ -n "$RELEASE_BODY" ]; then
  echo "Release notes:"
  echo "$RELEASE_BODY" | head -10
  echo "..."
  echo ""
fi

# Get download URL
DOWNLOAD_URL=$(echo "$RELEASE_JSON" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for asset in data.get('assets', []):
    if asset['name'] == '$ASSET_NAME':
        print(asset['browser_download_url'])
        break
" 2>/dev/null)

# Get checksum if available
CHECKSUM_URL=$(echo "$RELEASE_JSON" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for asset in data.get('assets', []):
    if asset['name'] == 'checksums.txt':
        print(asset['browser_download_url'])
        break
" 2>/dev/null)

if [ -z "$DOWNLOAD_URL" ]; then
  echo "⚠️  Download not found for $ASSET_NAME"
  echo "   Check: https://github.com/$GITHUB_REPO/releases/latest"
  exit 1
fi

echo "📦 Downloading: $ASSET_NAME"
echo "   Size: $(echo "$RELEASE_JSON" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for asset in data.get('assets', []):
    if asset['name'] == '$ASSET_NAME':
        size_mb = asset['size'] / (1024*1024)
        print(f'{size_mb:.1f} MB')
        break
" 2>/dev/null || echo 'unknown')"
echo ""

# Download with progress
TEMP_FILE="/tmp/pd-eff-update-$$.tar.gz"
if [ "$ASSET_NAME" = "pd-eff-windows.zip" ]; then
  TEMP_FILE="/tmp/pd-eff-update-$$.zip"
fi

curl -L --progress-bar -o "$TEMP_FILE" "$DOWNLOAD_URL"

if [ ! -f "$TEMP_FILE" ]; then
  echo "❌ Download failed"
  exit 1
fi

echo ""
echo "✅ Downloaded successfully"
echo ""

# Verify checksum if available
if [ -n "$CHECKSUM_URL" ]; then
  echo "🔐 Verifying checksum..."
  TEMP_CHECKSUM="/tmp/pd-eff-checksum-$$.txt"
  curl -sL -o "$TEMP_CHECKSUM" "$CHECKSUM_URL"
  
  EXPECTED=$(grep "$ASSET_NAME" "$TEMP_CHECKSUM" 2>/dev/null | awk '{print $1}')
  ACTUAL=$(sha256sum "$TEMP_FILE" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$TEMP_FILE" 2>/dev/null | awk '{print $1}')
  
  rm -f "$TEMP_CHECKSUM"
  
  if [ -n "$EXPECTED" ] && [ "$EXPECTED" = "$ACTUAL" ]; then
    echo "   ✅ Checksum verified: $ACTUAL"
  elif [ -n "$EXPECTED" ]; then
    echo "   ❌ Checksum mismatch!"
    echo "   Expected: $EXPECTED"
    echo "   Got:      $ACTUAL"
    echo "   Aborting update."
    rm -f "$TEMP_FILE"
    exit 1
  else
    echo "   ⚠️  No checksum found for this asset, skipping verification"
  fi
  echo ""
fi

# Backup current version
BACKUP_DIR="$INSTALL_DIR.backup-$(date +%Y%m%d%H%M%S)"
echo "📦 Backing up current version..."
cp -r "$INSTALL_DIR" "$BACKUP_DIR" 2>/dev/null || true

# Extract update
echo "📦 Installing update..."
cd "$INSTALL_DIR"

if [ "$ASSET_NAME" = "pd-eff-windows.zip" ]; then
  unzip -o "$TEMP_FILE" 2>/dev/null || tar -xzf "$TEMP_FILE" 2>/dev/null
else
  tar -xzf "$TEMP_FILE" --strip-components=1 2>/dev/null || tar -xzf "$TEMP_FILE"
fi

# Clean up
rm -f "$TEMP_FILE"

echo ""
echo "✅ Updated to v$LATEST_VERSION!"
echo "   Restart pd-eff to use the new version."
echo ""
echo "   Backup: $BACKUP_DIR"
echo "   Release: $RELEASE_URL"
