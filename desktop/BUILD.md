# pd-eff — Build Guide

## Prerequisites

| Tool | Purpose |
|------|---------|
| Python 3.10+ | Backend |
| Node.js 20+ | Frontend & Electron |
| npm | Package manager |
| PyInstaller | Python → standalone binary |

## Quick Build

### Linux (AppImage)
```bash
cd desktop
bash build-electron.sh appimage
# → dist/electron/pd-eff-1.1.0.AppImage
```

### Linux (standalone tar.gz)
```bash
cd desktop
bash build-linux.sh
# → dist/pd-eff-linux-x64.tar.gz
```

### Windows (NSIS installer + portable)
```bash
cd desktop
bash build-electron.sh win
# → dist/electron/pd-eff-setup-1.1.0-win-x64.exe
# → dist/electron/pd-eff-1.1.0-win-x64-portable.exe
```

### Windows (standalone zip)
```bash
cd desktop
bash build-windows.sh
# → dist/pd-eff-windows/
```

---

## Build Targets

### Electron Builds (requires Node.js)

| Target | Command | Output | Size |
|--------|---------|--------|------|
| **AppImage** | `build-electron.sh appimage` | `.AppImage` | ~100 MB |
| **deb** | `build-electron.sh deb` | `.deb` | ~100 MB |
| **rpm** | `build-electron.sh rpm` | `.rpm` | ~100 MB |
| **NSIS** | `build-electron.sh win` | `.exe` installer | ~100 MB |
| **Portable** | `build-electron.sh win` | `.exe` portable | ~100 MB |

> ⚠️ **deb/rpm builds** must run on their respective distros (Debian/Ubuntu or Fedora/RHEL).
> AppImage works on **any** Linux distribution.

### Standalone Builds (requires only Python)

| Platform | Command | Output | Size |
|----------|---------|--------|------|
| **Linux x64** | `build-linux.sh` | `pd-eff-linux-x64.tar.gz` | ~50 MB |
| **Windows x64** | `build-windows.sh` (run on Windows) | `pd-eff-windows/` | ~38 MB |

---

## CI/CD (GitHub Actions)

Triggers on `v*` tag push or manual dispatch:

| Job | Runner | Output |
|-----|--------|--------|
| `build-linux` | ubuntu-latest | `pd-eff-linux-x64.tar.gz` |
| `build-windows` | windows-latest | `pd-eff-windows/` |
| `electron-linux` | ubuntu-latest | `pd-eff-*.AppImage` |
| `electron-windows` | windows-latest | `pd-eff-*.exe` (NSIS + portable) |

Trigger a build:
```bash
git tag v1.2.0
git push origin v1.2.0
```

---

## Installing Packages

### AppImage (Linux — any distro)
```bash
chmod +x pd-eff-1.1.0.AppImage
./pd-eff-1.1.0.AppImage
```

### .deb (Debian/Ubuntu)
```bash
sudo dpkg -i pd-eff_1.1.0_amd64.deb
sudo apt-get install -f  # resolve dependencies
pd-eff
```

### .rpm (Fedora/RHEL)
```bash
sudo rpm -i pd-eff-1.1.0.x86_64.rpm
pd-eff
```

### NSIS Installer (Windows)
Double-click `pd-eff-setup-1.1.0-win-x64.exe` and follow the wizard.

### Portable (Windows)
Extract and run `pd-eff-1.1.0-win-x64-portable.exe` — no installation needed.

---

## Auto-Update

```bash
cd <install-directory>
./update.sh .
```

Checks GitHub releases for newer versions → downloads → verifies SHA256 → replaces files.

---

## Development

```bash
cd desktop
npm install
npm start          # Run Electron in dev mode (needs Python backend)
npm run build:linux  # Build Linux packages
npm run build:win    # Build Windows packages (Windows only)
```

---

## Project Structure

```
desktop/
├── main.js              # Electron main process (splash screen, window, IPC)
├── preload.js           # Secure IPC bridge
├── updater.js           # Electron auto-updater
├── update.sh            # Standalone auto-updater (no Electron)
├── package.json         # Electron + electron-builder config
├── build-electron.sh    # Build all Electron packages
├── build-linux.sh       # Build standalone Linux binary
├── build-windows.sh     # Build standalone Windows binary
├── build-deb.sh         # Build .deb package
├── build-universal.sh   # Build universal tar.gz
├── generate-icons.sh    # Generate app icons
├── BUILD.md             # This file
├── icon.png             # App icon
└── icons/               # Multi-size icons
    ├── 16x16.png
    ├── 32x32.png
    ├── 48x48.png
    ├── 64x64.png
    ├── 128x128.png
    ├── 256x256.png
    └── 512x512.png
```
