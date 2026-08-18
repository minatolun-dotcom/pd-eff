#!/bin/bash
# pd-eff Auto-Updater (Standalone)
# Checks GitHub for new versions and downloads them.

set -e

GITHUB_REPO="minatolun-dotcom/pdf-eff"
CURRENT_VERSION="${PDEFF_VERSION:-1.0.0}"
INSTALL_DIR="${1:-$(dirname "$0")}"

echo "🔍 pd-eff Auto-Updater"
echo "======================"
echo "Current version: $CURRENT_VERSION"
echo "Install dir: $INSTALL_DIR"
echo ""

# Check for updates
echo "Checking for updates..."
RELEASE_JSON=$(curl -s "https://api.github.com/repos/$GITHUB_REPO/releases/latest" 2>/dev/null || echo "{}")

if echo "$RELEASE_JSON" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
  LATEST_VERSION=$(echo "$RELEASE_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tag_name','v0.0.0').lstrip('v'))" 2>/dev/null || echo "0.0.0")
else
  echo "⚠️  Could not check for updates (network error)"
  LATEST_VERSION="0.0.0"
fi

echo "Latest version: $LATEST_VERSION"
echo ""

# Compare versions
if [ "$LATEST_VERSION" = "$CURRENT_VERSION" ]; then
  echo "✅ You are up to date! (v$CURRENT_VERSION)"
  exit 0
fi

# Check if newer
NEWER=$(python3 -c "
v1 = [int(x) for x in '$LATEST_VERSION'.split('.')]
v2 = [int(x) for x in '$CURRENT_VERSION'.split('.')]
for i in range(max(len(v1), len(v2))):
    a = v1[i] if i < len(v1) else 0
    b = v2[i] if i < len(v2) else 0
    if a > b:
        print('yes')
        break
    elif a < b:
        print('no')
        break
else:
    print('no')
" 2>/dev/null || echo "no")

if [ "$NEWER" != "yes" ]; then
  echo "✅ You have the latest version! (v$CURRENT_VERSION)"
  exit 0
fi

echo "🚀 New version available: v$LATEST_VERSION"
echo ""

# Determine platform
ARCH=$(uname -m)
OS=$(uname -s)

if [ "$OS" = "Linux" ] && [ "$ARCH" = "x86_64" ]; then
  ASSET_NAME="pd-eff-linux-x64.tar.gz"
elif [ "$OS" = "Linux" ] && [ "$ARCH" = "aarch64" ]; then
  ASSET_NAME="pd-eff-linux-arm64.tar.gz"
else
  echo "⚠️  Auto-update not available for $OS $ARCH"
  echo "   Download manually from: https://github.com/$GITHUB_REPO/releases/latest"
  exit 1
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

if [ -z "$DOWNLOAD_URL" ]; then
  echo "⚠️  Download not found for $ASSET_NAME"
  echo "   Check: https://github.com/$GITHUB_REPO/releases/latest"
  exit 1
fi

echo "📦 Downloading: $ASSET_NAME"
echo "   URL: $DOWNLOAD_URL"
echo ""

# Download
TEMP_FILE="/tmp/pd-eff-update-$$.tar.gz"
curl -L -o "$TEMP_FILE" "$DOWNLOAD_URL" 2>&1 | tail -3

if [ ! -f "$TEMP_FILE" ]; then
  echo "❌ Download failed"
  exit 1
fi

echo ""
echo "✅ Downloaded successfully"
echo ""

# Backup current version
BACKUP_DIR="$INSTALL_DIR.backup-$(date +%Y%m%d%H%M%S)"
echo "📦 Backing up current version to: $BACKUP_DIR"
cp -r "$INSTALL_DIR" "$BACKUP_DIR" 2>/dev/null || true

# Extract update
echo "📦 Installing update..."
cd "$INSTALL_DIR"
tar -xzf "$TEMP_FILE" --strip-components=1 2>/dev/null || tar -xzf "$TEMP_FILE"

# Clean up
rm -f "$TEMP_FILE"

echo ""
echo "✅ Updated to v$LATEST_VERSION!"
echo "   Restart pd-eff to use the new version."
echo ""
echo "   Backup saved at: $BACKUP_DIR"
