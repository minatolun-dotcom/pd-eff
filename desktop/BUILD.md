# pd-eff Desktop Build

## Build for Linux

```bash
cd desktop
bash build-linux.sh
```

Output: `dist/pd-eff-linux/` (folder) + `dist/pd-eff-linux-x64.tar.gz` (archive)

### To run:
```bash
cd dist/pd-eff-linux
./pd-eff
# Opens http://localhost:8765 in browser
```

### To distribute:
```bash
# Share the tar.gz
tar -xzf pd-eff-linux-x64.tar.gz
cd pd-eff-linux
./pd-eff
```

---

## Build for Windows

```bash
cd desktop
bash build-windows.sh
```

Output: `dist/pd-eff-windows/` (folder with .exe + .bat launcher)

### To run:
```
Double-click pd-eff.bat
Browser opens to http://localhost:8765
```

### To create installer:
1. Install [NSIS](https://nsis.sourceforge.io/)
2. Run `makensis installer.nsi`
3. Distribute `pd-eff-setup.exe`

---

## Requirements

### Linux
- Python 3.12+ (for building only)
- OpenSC (`sudo apt install opensc`) for USB key support
- Any browser

### Windows
- Python 3.12+ (for building only, or use pre-built .exe)
- OpenSC (for USB key support) — download from https://opensc.org
- Any browser

---

## How It Works

1. `pd-eff` / `pd-eff.exe` is a standalone Python executable
2. It starts a local web server on port 8765
3. Open your browser to http://localhost:8765
4. Upload PDFs, draw signature placement, sign with USB key
5. All data stored locally — no internet needed

---

## File Size

- Linux: ~55MB
- Windows: ~55MB
- No Python installation required on target machine
