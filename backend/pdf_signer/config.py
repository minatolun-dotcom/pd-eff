"""Application configuration."""
import os
from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
CERTS_DIR = DATA_DIR / "certs"
SIGNED_DIR = DATA_DIR / "signed"
DB_PATH = DATA_DIR / "app.db"

# Create directories on import
for d in [DATA_DIR, UPLOADS_DIR, CERTS_DIR, SIGNED_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Database URL
DATABASE_URL = f"sqlite:///{DB_PATH}"

# Allowed file types
ALLOWED_PDF_EXTENSIONS = {".pdf"}
ALLOWED_CERT_EXTENSIONS = {".pfx", ".p12"}
MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50MB
