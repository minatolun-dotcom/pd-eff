# pd-eff

Digital PDF signing and signature verification.

## Features

- 🔐 **Digital Signing** — Sign PDFs with PKCS#12 certificates or USB digital keys
- ✅ **Signature Verification** — Validate signatures, certificate chains, and trust status
- 📄 **Draw-to-Sign** — Draw a rectangle on the PDF to place your signature (like Acrobat)
- 🔑 **USB Key Auto-Detect** — Automatically detects plugged-in PKCS#11 tokens
- 📜 **Certificate Manager** — Generate self-signed certificates for testing
- 🛡️ **Tamper Detection** — Detect any modification to signed documents

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
| `GET` | `/api/pkcs11/tokens` | Detect USB keys |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12 / FastAPI |
| PDF Engine | PyHanko (PAdES, X.509) |
| Hardware Tokens | python-pkcs11 |
| Encryption | pikepdf (AES-256) |
| Frontend | Next.js 14 / React / TypeScript |
| PDF Viewer | pdfjs-dist |

## License

MIT
