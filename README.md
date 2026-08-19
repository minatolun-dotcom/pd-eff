# pd-eff

Digital PDF signing and signature verification. Works **100% offline**.

## Download

| Platform | Format | Link |
|----------|--------|------|
| 🐧 **Linux x64** | AppImage | [pd-eff-1.1.0.AppImage](https://github.com/minatolun-dotcom/pdf-eff/releases/latest/download/pd-eff-linux-x64.tar.gz) |
| 🐧 **Linux x64** | tar.gz (standalone) | [pd-eff-linux-x64.tar.gz](https://github.com/minatolun-dotcom/pdf-eff/releases/latest/download/pd-eff-linux-x64.tar.gz) |
| 🪟 **Windows x64** | zip (standalone) | [pd-eff-windows.zip](https://github.com/minatolun-dotcom/pdf-eff/releases/latest/download/pd-eff-windows.zip) |

**Linux AppImage:**
```bash
chmod +x pd-eff-*.AppImage
./pd-eff-*.AppImage
```

**Linux tar.gz:**
```bash
tar -xzf pd-eff-linux-x64.tar.gz
cd pd-eff-linux-x64
./pd-eff
```

**Windows:** Extract zip → double-click `pd-eff.bat`

## Features

- 🔐 **Digital Signing** — Sign PDFs with PKCS#12 certificates or USB digital keys
- ✅ **Signature Verification** — Validate signatures, certificate chains, and trust status
- 📄 **Draw-to-Sign** — Draw a rectangle on the PDF to place your signature (like Acrobat)
- 🔑 **USB Key Auto-Detect** — Automatically detects plugged-in PKCS#11 tokens
- 📜 **Certificate Manager** — Generate self-signed certificates for testing
- 🛡️ **Tamper Detection** — Detect any modification to signed documents
- 📦 **Electron Desktop App** — Native window with splash screen and auto-updater
- 🔄 **Auto-Update** — `./update.sh .` to check for and install updates

## Quick Start

### Local Development

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install pikepdf nest-asyncio
python run.py
# → http://localhost:8000

# Frontend
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### One-click Start

```bash
./start.sh
```

## Deploy to Render.com (Free)

See [DEPLOY.md](./DEPLOY.md) for full instructions.

**TL;DR:**
1. Push to GitHub
2. Create Web Service for backend (Python)
3. Create Static Site for frontend (Next.js)
4. Set `NEXT_PUBLIC_API_URL=https://pd-eff-api.onrender.com`

## How to Use

### Sign a PDF

1. Go to **Sign** page
2. Upload a PDF
3. **Draw a rectangle** on the PDF where you want the signature
4. Plug in your **USB digital key** (auto-detected!)
5. Enter your **PIN**
6. Click **Sign here**
7. Download the signed PDF

### Verify a PDF

1. Go to **Verify** page
2. Upload a signed PDF
3. See validation results (intact, valid, signer info)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sign/pkcs11` | Sign with USB key |
| `POST` | `/api/sign/advanced` | Sign with certificate |
| `POST` | `/api/verify` | Verify signatures |
| `POST` | `/api/certificates/generate` | Generate test cert |
| `GET` | `/api/pkcs11/tokens` | Detect USB keys |## Desktop App (Electron)

For a native desktop experience with window chrome, splash screen, and auto-updates:

```bash
cd desktop
npm install
npm start              # Dev mode
npm run build:linux    # Build AppImage + deb + rpm
npm run build:win      # Build NSIS installer + portable
```

See [desktop/BUILD.md](./desktop/BUILD.md) for full build instructions.

## Docker

```bash
docker build -t pd-eff .
docker run -p 8765:8765 pd-eff
# → http://localhost:8765
```

## Tech Stack


| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12 / FastAPI |
| PDF Engine | PyHanko (PAdES, X.509) |
| Hardware Tokens | python-pkcs11 |
| Encryption | pikepdf (AES-256) |
| Frontend | Next.js 14 / React / TypeScript |
| PDF Viewer | pdfjs-dist |
| Desktop | Electron 28 / electron-builder |

## License

MIT
