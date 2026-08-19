"""pd-eff — PDF Digital Signing & Verification API."""
import asyncio
import json
import os
import shutil
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, UploadFile, Form, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .database import init_db, get_db, Certificate, SigningRecord, VerificationRecord, TrustedCertificate
from .config import UPLOADS_DIR, CERTS_DIR, SIGNED_DIR, MAX_UPLOAD_SIZE, ALLOWED_PDF_EXTENSIONS, ALLOWED_CERT_EXTENSIONS
from .cert_utils import parse_pkcs12, generate_self_signed_cert
from .signing_service import sign_pdf, get_signature_positions, get_timestamp_servers, encrypt_pdf, get_pdf_info
from .verification_service import verify_pdf
from .trust_store import extract_certs_from_pdf
from .verification_stamp import stamp_verification_result


# Create app
app = FastAPI(
    title="pd-eff API",
    description="PDF digital signing and signature verification — pd-eff",
    version="1.0.0",
)

# CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://pdf-signer-frontend.onrender.com",
        "*.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()

    # Cleanup old temp files (>1 hour) on startup
    _cleanup_old_files(UPLOADS_DIR, max_age_hours=1)
    _cleanup_old_files(SIGNED_DIR, max_age_hours=24)


def _cleanup_old_files(directory: Path, max_age_hours: int = 1):
    """Remove files older than max_age_hours to prevent disk leak."""
    import time as _time
    now = _time.time()
    cutoff = now - (max_age_hours * 3600)
    removed = 0
    for f in directory.iterdir():
        if f.is_file() and f.stat().st_mtime < cutoff:
            try:
                f.unlink()
                removed += 1
            except Exception:
                pass
    if removed:
        print(f"Cleaned up {removed} old files from {directory.name}/")

    # Serve frontend (standalone Next.js build)
    # Docker: FRONTEND_DIR=/app/.next-standalone
    # Desktop: frontend/.next/standalone/
    frontend_env = os.environ.get("FRONTEND_DIR", "")
    possible_dirs = [
        Path(frontend_env) if frontend_env else None,
        Path(__file__).parent.parent / ".next-standalone",
        Path(__file__).parent.parent.parent / "frontend" / ".next" / "standalone",
    ]

    standalone_dir = None
    for d in possible_dirs:
        if d and d.exists() and (d / "server").exists():
            standalone_dir = d
            break

    if standalone_dir:
        # Serve _next/static assets
        static_dir = standalone_dir / ".next" / "static"
        if static_dir.exists():
            app.mount("/_next/static", StaticFiles(directory=str(static_dir)), name="next-static")

        # Serve public assets
        public_dir = standalone_dir / "public"
        if public_dir.exists():
            app.mount("/public", StaticFiles(directory=str(public_dir)), name="public")

        # Catch-all: serve Next.js pages for non-API routes
        @app.get("/{full_path:path}")
        async def serve_frontend(full_path: str):
            # Skip API routes
            if full_path.startswith("api/"):
                raise HTTPException(404, "Not found")

            # Try to find the page in standalone
            server_dir = standalone_dir / "server" / "app"
            page_file = server_dir / f"{full_path}" / "page.js"
            root_file = server_dir / "page.js"

            # Serve index.html from Next.js build
            index_file = standalone_dir / "index.html"
            if index_file.exists():
                return FileResponse(str(index_file), media_type="text/html")

            # Fallback to root page
            if root_file.exists():
                return FileResponse(str(root_file), media_type="text/html")

            raise HTTPException(404, "Page not found")


# ─── Health ───────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "pd-eff"}


# ─── Certificate Management ──────────────────────────────────────

@app.post("/api/certificates")
async def upload_certificate(
    file: UploadFile = File(...),
    name: str = Form(""),
    passphrase: str = Form(""),
    db: Session = Depends(get_db),
):
    """Upload a PKCS#12 (.pfx/.p12) certificate."""
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_CERT_EXTENSIONS:
        raise HTTPException(400, f"Invalid file type. Allowed: {ALLOWED_CERT_EXTENSIONS}")

    # Save file
    cert_id = str(uuid.uuid4())
    save_path = CERTS_DIR / f"{cert_id}{ext}"
    with open(save_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Parse certificate info
    try:
        cert_info = parse_pkcs12(str(save_path), passphrase.encode("utf-8") if passphrase else b"")
    except Exception as e:
        os.remove(save_path)
        raise HTTPException(400, f"Could not parse certificate: {str(e)}")

    # Save to database
    cert = Certificate(
        id=cert_id,
        name=name or cert_info["subject_cn"] or file.filename,
        filename=file.filename,
        file_path=str(save_path),
        subject_cn=cert_info["subject_cn"],
        subject_o=cert_info["subject_o"],
        issuer_cn=cert_info["issuer_cn"],
        serial_number=cert_info["serial_number"],
        not_valid_before=cert_info["not_valid_before"],
        not_valid_after=cert_info["not_valid_after"],
        is_self_signed=1 if cert_info["is_self_signed"] else 0,
        key_algorithm=cert_info["key_algorithm"],
    )
    db.add(cert)
    db.commit()

    return {
        "id": cert.id,
        "name": cert.name,
        "subject_cn": cert.subject_cn,
        "subject_o": cert.subject_o,
        "issuer_cn": cert.issuer_cn,
        "serial_number": cert.serial_number,
        "not_valid_before": cert.not_valid_before.isoformat() if cert.not_valid_before else None,
        "not_valid_after": cert.not_valid_after.isoformat() if cert.not_valid_after else None,
        "is_self_signed": bool(cert.is_self_signed),
        "key_algorithm": cert.key_algorithm,
    }


@app.post("/api/certificates/generate")
def generate_certificate(
    common_name: str = Form("Test Signer"),
    organization: str = Form("PDF Signer App"),
    valid_days: int = Form(365),
    db: Session = Depends(get_db),
):
    """Generate a self-signed certificate for testing."""
    result = generate_self_signed_cert(
        common_name=common_name,
        organization=organization,
        valid_days=valid_days,
    )

    # Save to database
    cert = Certificate(
        id=result["cert_id"],
        name=common_name,
        filename=f"{common_name.replace(' ', '_')}.p12",
        file_path=result["pfx_path"],
        subject_cn=result["subject_cn"],
        subject_o=result["subject_o"],
        issuer_cn=result["issuer_cn"],
        serial_number=result["serial_number"],
        not_valid_before=result["not_valid_before"],
        not_valid_after=result["not_valid_after"],
        is_self_signed=1,
        key_algorithm=result["key_algorithm"],
    )
    db.add(cert)
    db.commit()

    return {
        "id": cert.id,
        "name": cert.name,
        "subject_cn": cert.subject_cn,
        "subject_o": cert.subject_o,
        "serial_number": cert.serial_number,
        "not_valid_after": cert.not_valid_after.isoformat() if cert.not_valid_after else None,
        "message": f"Certificate generated. Default passphrase: {result['pfx_passphrase']}",
        "passphrase": result["pfx_passphrase"],
    }


@app.get("/api/certificates")
def list_certificates(db: Session = Depends(get_db)):
    """List all certificates."""
    certs = db.query(Certificate).order_by(Certificate.created_at.desc()).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "filename": c.filename,
            "subject_cn": c.subject_cn,
            "subject_o": c.subject_o,
            "issuer_cn": c.issuer_cn,
            "serial_number": c.serial_number,
            "not_valid_before": c.not_valid_before.isoformat() if c.not_valid_before else None,
            "not_valid_after": c.not_valid_after.isoformat() if c.not_valid_after else None,
            "is_self_signed": bool(c.is_self_signed),
            "key_algorithm": c.key_algorithm,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in certs
    ]


@app.delete("/api/certificates/{cert_id}")
def delete_certificate(cert_id: str, db: Session = Depends(get_db)):
    """Delete a certificate."""
    cert = db.query(Certificate).filter(Certificate.id == cert_id).first()
    if not cert:
        raise HTTPException(404, "Certificate not found")

    # Remove file
    if os.path.exists(cert.file_path):
        os.remove(cert.file_path)

    db.delete(cert)
    db.commit()
    return {"message": "Certificate deleted"}


# ─── PDF Signing ──────────────────────────────────────────────────

@app.post("/api/sign")
async def sign_pdf_endpoint(
    file: UploadFile = File(...),
    certificate_id: str = Form(...),
    passphrase: str = Form(""),
    signer_name: str = Form(""),
    visible: bool = Form(True),
    db: Session = Depends(get_db),
):
    """Digitally sign a PDF file."""
    # Validate PDF
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_PDF_EXTENSIONS:
        raise HTTPException(400, "Only PDF files are accepted")

    # Get certificate
    cert = db.query(Certificate).filter(Certificate.id == certificate_id).first()
    if not cert:
        raise HTTPException(404, "Certificate not found")

    # Validate file size
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(413, f"File too large. Max size: {MAX_UPLOAD_SIZE // 1024 // 1024}MB")
    if len(content) == 0:
        raise HTTPException(400, "Empty file")

    # Save uploaded PDF
    pdf_id = str(uuid.uuid4())
    pdf_path = UPLOADS_DIR / f"{pdf_id}_{file.filename}"
    with open(pdf_path, "wb") as f:
        f.write(content)

    # Sign the PDF
    try:
        result = sign_pdf(
            pdf_path=str(pdf_path),
            pfx_path=cert.file_path,
            passphrase=passphrase,
            signer_name=signer_name or cert.subject_cn or "Unknown",
            visible=visible,
        )
    except Exception as e:
        raise HTTPException(500, f"Signing failed: {str(e)}")

    # Record signing operation
    record = SigningRecord(
        original_filename=file.filename,
        original_path=str(pdf_path),
        signed_filename=Path(result["output_path"]).name,
        signed_path=result["output_path"],
        certificate_id=certificate_id,
        signer_name=signer_name or cert.subject_cn,
        signature_type="visible" if visible else "invisible",
    )
    db.add(record)
    db.commit()

    return {
        "id": record.id,
        "signed_filename": record.signed_filename,
        "field_name": result["field_name"],
        "signer_name": result["signer_name"],
        "timestamp": result["timestamp"],
        "download_url": f"/api/download/{record.id}",
    }


@app.get("/api/download/{record_id}")
async def download_signed_pdf(record_id: str, db: Session = Depends(get_db)):
    """Download a signed PDF."""
    record = db.query(SigningRecord).filter(SigningRecord.id == record_id).first()
    if not record:
        raise HTTPException(404, "Signed PDF not found")

    if not os.path.exists(record.signed_path):
        raise HTTPException(404, "Signed file not found on disk")

    return FileResponse(
        record.signed_path,
        filename=record.signed_filename,
        media_type="application/pdf",
    )


@app.get("/api/signing-records")
def list_signing_records(db: Session = Depends(get_db)):
    """List all signing records."""
    records = db.query(SigningRecord).order_by(SigningRecord.signed_at.desc()).all()
    return [
        {
            "id": r.id,
            "original_filename": r.original_filename,
            "signed_filename": r.signed_filename,
            "signer_name": r.signer_name,
            "signature_type": r.signature_type,
            "signed_at": r.signed_at.isoformat() if r.signed_at else None,
            "download_url": f"/api/download/{r.id}",
        }
        for r in records
    ]


# ─── PDF Verification ────────────────────────────────────────────

@app.post("/api/verify")
async def verify_pdf_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Verify digital signatures in a PDF file."""
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_PDF_EXTENSIONS:
        raise HTTPException(400, "Only PDF files are accepted")

    # Validate and save
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(413, f"File too large. Max: {MAX_UPLOAD_SIZE // 1024 // 1024}MB")
    if len(content) == 0:
        raise HTTPException(400, "Empty file")

    verify_id = str(uuid.uuid4())
    pdf_path = UPLOADS_DIR / f"verify_{verify_id}_{file.filename}"
    with open(pdf_path, "wb") as f:
        f.write(content)

    # Get trusted PEMs from store (auto-use if available)
    trusted_certs = db.query(TrustedCertificate).all()
    trusted_pems = [c.pem_data for c in trusted_certs if c.pem_data]

    # Verify (with trust store if available)
    try:
        result = verify_pdf(str(pdf_path), trusted_pems=trusted_pems if trusted_pems else None)
    except Exception as e:
        raise HTTPException(500, f"Verification failed: {str(e)}")

    # Record verification
    record = VerificationRecord(
        filename=file.filename,
        file_path=str(pdf_path),
        is_valid=1 if result["is_valid"] else 0,
        signature_count=result["signature_count"],
        validation_details=json.dumps(result, default=str),
    )
    db.add(record)
    db.commit()

    return {
        "id": record.id,
        **result,
    }


@app.get("/api/verification-records")
def list_verification_records(db: Session = Depends(get_db)):
    """List all verification records."""
    records = db.query(VerificationRecord).order_by(VerificationRecord.verified_at.desc()).all()
    return [
        {
            "id": r.id,
            "filename": r.filename,
            "is_valid": bool(r.is_valid),
            "signature_count": r.signature_count,
            "verified_at": r.verified_at.isoformat() if r.verified_at else None,
        }
        for r in records
    ]


# ─── Trust Store Management ────────────────────────────────────

@app.get("/api/trust-store")
def list_trusted_certificates(db: Session = Depends(get_db)):
    """List all certificates in the trust store."""
    certs = db.query(TrustedCertificate).order_by(TrustedCertificate.added_at.desc()).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "subject_cn": c.subject_cn,
            "subject_o": c.subject_o,
            "issuer_cn": c.issuer_cn,
            "serial_number": c.serial_number,
            "not_valid_before": c.not_valid_before.isoformat() if c.not_valid_before else None,
            "not_valid_after": c.not_valid_after.isoformat() if c.not_valid_after else None,
            "is_self_signed": bool(c.is_self_signed),
            "purpose": c.purpose,
            "added_at": c.added_at.isoformat() if c.added_at else None,
        }
        for c in certs
    ]


@app.post("/api/trust-store")
def add_to_trust_store(
    name: str = Form(...),
    pem_data: str = Form(...),
    purpose: str = Form("signing"),
    db: Session = Depends(get_db),
):
    """Add a certificate to the trust store."""
    from cryptography import x509 as pyca_x509
    from cryptography.hazmat.primitives import serialization

    try:
        # Parse PEM to extract info
        pem_bytes = pem_data.encode("ascii") if isinstance(pem_data, str) else pem_data
        cert = pyca_x509.load_pem_x509_certificate(pem_bytes)

        # Check if already trusted by serial number
        serial = str(cert.serial_number)
        existing = db.query(TrustedCertificate).filter(TrustedCertificate.serial_number == serial).first()
        if existing:
            raise HTTPException(409, f"Certificate already trusted: {existing.name}")

        # Extract subject info
        cn = ""
        org = ""
        for attr in cert.subject:
            if attr.oid.dotted_string == "2.5.4.3":
                cn = attr.value
            elif attr.oid.dotted_string == "2.5.4.10":
                org = attr.value

        issuer_cn = ""
        for attr in cert.issuer:
            if attr.oid.dotted_string == "2.5.4.3":
                issuer_cn = attr.value
                break

        trusted = TrustedCertificate(
            name=name,
            subject_cn=cn,
            subject_o=org,
            issuer_cn=issuer_cn,
            serial_number=serial,
            not_valid_before=cert.not_valid_before_utc.replace(tzinfo=None),
            not_valid_after=cert.not_valid_after_utc.replace(tzinfo=None),
            is_self_signed=1 if cert.issuer == cert.subject else 0,
            pem_data=pem_bytes.decode("ascii"),
            purpose=purpose,
        )
        db.add(trusted)
        db.commit()

        return {
            "id": trusted.id,
            "name": trusted.name,
            "subject_cn": cn,
            "issuer_cn": issuer_cn,
            "serial_number": serial,
            "message": f"Certificate '{name}' added to trust store",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Invalid certificate: {str(e)}")


@app.delete("/api/trust-store/{cert_id}")
def remove_from_trust_store(cert_id: str, db: Session = Depends(get_db)):
    """Remove a certificate from the trust store."""
    cert = db.query(TrustedCertificate).filter(TrustedCertificate.id == cert_id).first()
    if not cert:
        raise HTTPException(404, "Certificate not found in trust store")
    db.delete(cert)
    db.commit()
    return {"message": f"Certificate '{cert.name}' removed from trust store"}


@app.post("/api/trust-store/extract")
async def extract_and_trust(
    file: UploadFile = File(...),
    certificate_index: int = Form(0),
    name: str = Form(""),
    purpose: str = Form("signing"),
    db: Session = Depends(get_db),
):
    """Extract certificates from a signed PDF and add one to the trust store."""
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_PDF_EXTENSIONS:
        raise HTTPException(400, "Only PDF files are accepted")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(400, "Empty file")

    # Save temporarily
    pdf_id = str(uuid.uuid4())
    pdf_path = UPLOADS_DIR / f"extract_{pdf_id}_{file.filename}"
    with open(pdf_path, "wb") as f:
        f.write(content)

    try:
        certs = extract_certs_from_pdf(str(pdf_path))
        if not certs:
            raise HTTPException(400, "No certificates found in this PDF")

        if certificate_index >= len(certs):
            raise HTTPException(400, f"Certificate index {certificate_index} out of range (found {len(certs)})")

        target_cert = certs[certificate_index]
        cert_name = name or target_cert.get("subject_cn", "Unknown") or f"Certificate {certificate_index}"

        # Check if already trusted
        serial = target_cert.get("serial_number", "")
        existing = db.query(TrustedCertificate).filter(TrustedCertificate.serial_number == serial).first()
        if existing:
            raise HTTPException(409, f"Certificate already trusted: {existing.name}")

        # Parse dates
        try:
            from datetime import datetime as dt
            not_before = dt.fromisoformat(target_cert["not_valid_before"].replace("+00:00", "")) if target_cert.get("not_valid_before") else None
            not_after = dt.fromisoformat(target_cert["not_valid_after"].replace("+00:00", "")) if target_cert.get("not_valid_after") else None
        except Exception:
            not_before = None
            not_after = None

        trusted = TrustedCertificate(
            name=cert_name,
            subject_cn=target_cert.get("subject_cn", ""),
            subject_o=target_cert.get("subject_o", ""),
            issuer_cn=target_cert.get("issuer_cn", ""),
            serial_number=serial,
            not_valid_before=not_before,
            not_valid_after=not_after,
            is_self_signed=1 if target_cert.get("is_self_signed") else 0,
            pem_data=target_cert.get("pem", ""),
            purpose=purpose,
        )
        db.add(trusted)
        db.commit()

        return {
            "id": trusted.id,
            "name": cert_name,
            "subject_cn": target_cert.get("subject_cn", ""),
            "issuer_cn": target_cert.get("issuer_cn", ""),
            "serial_number": serial,
            "total_certs": len(certs),
            "all_certs": [
                {"index": i, "cn": c.get("subject_cn", ""), "issuer": c.get("issuer_cn", "")}
                for i, c in enumerate(certs)
            ],
            "message": f"Certificate '{cert_name}' added to trust store",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to extract certificates: {str(e)}")
    finally:
        # Cleanup
        try:
            os.remove(pdf_path)
        except Exception:
            pass


@app.post("/api/trust-store/extract-bulk")
async def extract_and_trust_bulk(
    file: UploadFile = File(...),
    purpose: str = Form("signing"),
    db: Session = Depends(get_db),
):
    """Extract ALL unique certificates from a signed PDF and add them to the trust store."""
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_PDF_EXTENSIONS:
        raise HTTPException(400, "Only PDF files are accepted")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(400, "Empty file")

    pdf_id = str(uuid.uuid4())
    pdf_path = UPLOADS_DIR / f"bulk_extract_{pdf_id}_{file.filename}"
    with open(pdf_path, "wb") as f:
        f.write(content)

    try:
        certs = extract_certs_from_pdf(str(pdf_path))
        if not certs:
            raise HTTPException(400, "No certificates found in this PDF")

        added = []
        skipped = []
        for cert_info in certs:
            serial = cert_info.get("serial_number", "")
            if not serial:
                continue
            existing = db.query(TrustedCertificate).filter(TrustedCertificate.serial_number == serial).first()
            if existing:
                skipped.append({"cn": cert_info.get("subject_cn", ""), "serial": serial, "reason": "already_trusted"})
                continue

            try:
                from datetime import datetime as dt
                not_before = dt.fromisoformat(cert_info["not_valid_before"].replace("+00:00", "")) if cert_info.get("not_valid_before") else None
                not_after = dt.fromisoformat(cert_info["not_valid_after"].replace("+00:00", "")) if cert_info.get("not_valid_after") else None
            except Exception:
                not_before = None
                not_after = None

            cn = cert_info.get("subject_cn", "") or f"Certificate"
            trusted = TrustedCertificate(
                name=cn,
                subject_cn=cert_info.get("subject_cn", ""),
                subject_o=cert_info.get("subject_o", ""),
                issuer_cn=cert_info.get("issuer_cn", ""),
                serial_number=serial,
                not_valid_before=not_before,
                not_valid_after=not_after,
                is_self_signed=1 if cert_info.get("is_self_signed") else 0,
                pem_data=cert_info.get("pem", ""),
                purpose=purpose,
            )
            db.add(trusted)
            added.append({"cn": cn, "serial": serial})

        db.commit()
        return {
            "total_found": len(certs),
            "added": len(added),
            "skipped": len(skipped),
            "certificates": added,
            "skipped_details": skipped,
            "message": f"Added {len(added)} certificates to trust store ({len(skipped)} already trusted)",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to extract certificates: {str(e)}")
    finally:
        try:
            os.remove(pdf_path)
        except Exception:
            pass


@app.post("/api/trust-store/bundle")
def load_ca_bundle(
    bundle: str = Form("india"),
    db: Session = Depends(get_db),
):
    """Load a pre-bundled set of trusted root certificates."""
    from .trust_store import CA_BUNDLES

    if bundle not in CA_BUNDLES:
        raise HTTPException(400, f"Unknown bundle: {bundle}. Available: {list(CA_BUNDLES.keys())}")

    certs_data = CA_BUNDLES[bundle]
    added = []
    skipped = []

    for cert_info in certs_data:
        serial = cert_info.get("serial_number", "")
        if not serial:
            continue
        existing = db.query(TrustedCertificate).filter(TrustedCertificate.serial_number == serial).first()
        if existing:
            skipped.append(cert_info["name"])
            continue

        trusted = TrustedCertificate(
            name=cert_info["name"],
            subject_cn=cert_info.get("subject_cn", ""),
            subject_o=cert_info.get("subject_o", ""),
            issuer_cn=cert_info.get("issuer_cn", ""),
            serial_number=serial,
            is_self_signed=1,
            pem_data=cert_info.get("pem", ""),
            purpose="signing",
        )
        db.add(trusted)
        added.append(cert_info["name"])

    db.commit()
    return {
        "bundle": bundle,
        "added": len(added),
        "skipped": len(skipped),
        "certificates": added,
        "skipped_details": skipped,
        "message": f"Loaded {len(added)} root certificates from '{bundle}' bundle ({len(skipped)} already trusted)",
    }


@app.get("/api/trust-store/bundles")
def list_ca_bundles():
    """List available CA certificate bundles."""
    from .trust_store import CA_BUNDLES
    return {"bundles": list(CA_BUNDLES.keys())}


@app.post("/api/verify/trusted")
async def verify_with_trust_store(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Verify a PDF using certificates from the trust store."""
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_PDF_EXTENSIONS:
        raise HTTPException(400, "Only PDF files are accepted")

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(413, f"File too large. Max: {MAX_UPLOAD_SIZE // 1024 // 1024}MB")
    if len(content) == 0:
        raise HTTPException(400, "Empty file")

    verify_id = str(uuid.uuid4())
    pdf_path = UPLOADS_DIR / f"verify_{verify_id}_{file.filename}"
    with open(pdf_path, "wb") as f:
        f.write(content)

    # Get trusted PEMs from store
    trusted_certs = db.query(TrustedCertificate).all()
    trusted_pems = [c.pem_data for c in trusted_certs if c.pem_data]

    try:
        result = verify_pdf(str(pdf_path), trusted_pems=trusted_pems)
    except Exception as e:
        raise HTTPException(500, f"Verification failed: {str(e)}")

    # Record verification
    record = VerificationRecord(
        filename=file.filename,
        file_path=str(pdf_path),
        is_valid=1 if result["is_valid"] else 0,
        signature_count=result["signature_count"],
        validation_details=json.dumps(result, default=str),
    )
    db.add(record)
    db.commit()

    return {
        "id": record.id,
        "trusted_store_used": len(trusted_pems),
        **result,
    }


@app.post("/api/verify/stamp")
async def stamp_verified_pdf(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Verify a PDF and create a stamped copy with verification result embedded."""
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_PDF_EXTENSIONS:
        raise HTTPException(400, "Only PDF files are accepted")

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(413, f"File too large. Max: {MAX_UPLOAD_SIZE // 1024 // 1024}MB")
    if len(content) == 0:
        raise HTTPException(400, "Empty file")

    verify_id = str(uuid.uuid4())
    pdf_path = UPLOADS_DIR / f"stamp_{verify_id}_{file.filename}"
    with open(pdf_path, "wb") as f:
        f.write(content)

    # Get trusted PEMs
    trusted_certs = db.query(TrustedCertificate).all()
    trusted_pems = [c.pem_data for c in trusted_certs if c.pem_data]

    # Verify
    try:
        result = verify_pdf(str(pdf_path), trusted_pems=trusted_pems if trusted_pems else None)
    except Exception as e:
        raise HTTPException(500, f"Verification failed: {str(e)}")

    # Create stamped PDF
    try:
        stamped_path = stamp_verification_result(str(pdf_path), result)
        stamped_name = Path(stamped_path).name
    except Exception as e:
        raise HTTPException(500, f"Failed to create verification stamp: {str(e)}")

    # Record verification
    record = VerificationRecord(
        filename=file.filename,
        file_path=str(pdf_path),
        is_valid=1 if result["is_valid"] else 0,
        signature_count=result["signature_count"],
        validation_details=json.dumps(result, default=str),
    )
    db.add(record)
    db.commit()

    return {
        "id": record.id,
        "verification": result,
        "stamped_filename": stamped_name,
        "download_url": f"/api/download-file/{stamped_name}",
    }


# ─── PDF Info & Encryption ──────────────────────────────────────

@app.get("/api/pdf/info")
def get_pdf_info_endpoint(pdf_path: str):
    """Get PDF metadata and signature information."""
    # Security: only allow paths within data directory
    resolved = Path(pdf_path).resolve()
    allowed_dirs = [d.resolve() for d in [UPLOADS_DIR, SIGNED_DIR, CERTS_DIR]]
    allowed = any(str(resolved).startswith(str(d)) for d in allowed_dirs)
    if not allowed and os.path.exists(pdf_path):
        # Also allow /tmp for development
        allowed = str(resolved).startswith("/tmp")
    if not os.path.exists(pdf_path) or not allowed:
        raise HTTPException(404, "PDF file not found")
    return get_pdf_info(pdf_path)


@app.post("/api/pdf/encrypt")
async def encrypt_pdf_endpoint(
    file: UploadFile = File(...),
    user_password: str = Form(""),
    owner_password: str = Form(""),
):
    """Encrypt a PDF file with password protection."""
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_PDF_EXTENSIONS:
        raise HTTPException(400, "Only PDF files are accepted")

    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(413, f"File too large. Max: {MAX_UPLOAD_SIZE // 1024 // 1024}MB")
    if len(content) == 0:
        raise HTTPException(400, "Empty file")

    pdf_id = str(uuid.uuid4())
    pdf_path = UPLOADS_DIR / f"{pdf_id}_{file.filename}"
    with open(pdf_path, "wb") as f:
        f.write(content)

    try:
        result = encrypt_pdf(
            pdf_path=pdf_path,
            user_password=user_password,
            owner_password=owner_password,
        )
    except Exception as e:
        raise HTTPException(500, f"Encryption failed: {str(e)}")

    encrypted_name = Path(result["output_path"]).name
    return {
        "encrypted_filename": encrypted_name,
        "download_url": f"/api/download-file/{encrypted_name}",
        **{k: v for k, v in result.items() if k != "output_path"},
    }


@app.get("/api/download-file/{filename}")
async def download_file(filename: str):
    """Download any file from the signed directory."""
    file_path = SIGNED_DIR / filename
    if not os.path.exists(file_path):
        raise HTTPException(404, "File not found")
    return FileResponse(
        file_path,
        filename=filename,
        media_type="application/pdf",
    )


# ─── Signature Placement & Timestamp Servers ────────────────────

@app.get("/api/signature/positions")
def get_signature_positions_endpoint(
    page_width: float = 612,
    page_height: float = 792,
):
    """Get predefined signature placement positions for a page size."""
    positions = get_signature_positions(page_width, page_height)
    return {
        "page_width": page_width,
        "page_height": page_height,
        "positions": {
            name: {"x1": pos[0], "y1": pos[1], "x2": pos[2], "y2": pos[3]}
            for name, pos in positions.items()
        },
    }


@app.get("/api/timestamp/servers")
def list_timestamp_servers():
    """List common RFC 3161 timestamp servers."""
    return {"servers": get_timestamp_servers()}


@app.post("/api/sign/advanced")
async def sign_pdf_advanced(
    file: UploadFile = File(...),
    certificate_id: str = Form(...),
    passphrase: str = Form(""),
    signer_name: str = Form(""),
    visible: bool = Form(True),
    position: str = Form("bottom_right"),
    custom_x1: float = Form(None),
    custom_y1: float = Form(None),
    custom_x2: float = Form(None),
    custom_y2: float = Form(None),
    stamp_text: str = Form(""),
    timestamp_url: str = Form(""),
    reason: str = Form(""),
    location: str = Form(""),
    existing_pdf_id: str = Form(""),
    db: Session = Depends(get_db),
):
    """Sign a PDF with advanced options. Supports multiple signatures on same document."""
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_PDF_EXTENSIONS:
        raise HTTPException(400, "Only PDF files are accepted")

    # Validate file size upfront
    content = await file.read()
    await file.seek(0)
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(413, f"File too large. Max: {MAX_UPLOAD_SIZE // 1024 // 1024}MB")
    if len(content) == 0:
        raise HTTPException(400, "Empty file")

    cert = db.query(Certificate).filter(Certificate.id == certificate_id).first()
    if not cert:
        raise HTTPException(404, "Certificate not found")

    # If existing_pdf_id is provided, sign the already-signed PDF (multiple signatures)
    if existing_pdf_id:
        existing_record = db.query(SigningRecord).filter(SigningRecord.id == existing_pdf_id).first()
        if existing_record and os.path.exists(existing_record.signed_path):
            pdf_path = existing_record.signed_path
        else:
            # Save new file
            pdf_id = str(uuid.uuid4())
            pdf_path = UPLOADS_DIR / f"{pdf_id}_{file.filename}"
            with open(pdf_path, "wb") as f:
                content = await file.read()
                f.write(content)
    else:
        pdf_id = str(uuid.uuid4())
        pdf_path = UPLOADS_DIR / f"{pdf_id}_{file.filename}"
        with open(pdf_path, "wb") as f:
            content = await file.read()
            f.write(content)

    # Determine signature box
    positions = get_signature_positions()
    if custom_x1 is not None and custom_y1 is not None and custom_x2 is not None and custom_y2 is not None:
        signature_box = (custom_x1, custom_y1, custom_x2, custom_y2)
    elif position in positions:
        signature_box = positions[position]
    else:
        signature_box = positions["bottom_right"]

    # Resolve timestamp URL
    ts_url = None
    if timestamp_url:
        ts_servers = {s["name"]: s["url"] for s in get_timestamp_servers()}
        ts_url = ts_servers.get(timestamp_url, timestamp_url)

    try:
        result = sign_pdf(
            pdf_path=str(pdf_path),
            pfx_path=cert.file_path,
            passphrase=passphrase,
            signer_name=signer_name or cert.subject_cn or "Unknown",
            visible=visible,
            signature_box=signature_box,
            stamp_text=stamp_text if stamp_text else None,
            timestamp_url=ts_url,
            reason=reason,
            location=location,
        )
    except Exception as e:
        raise HTTPException(500, f"Signing failed: {str(e)}")

    record = SigningRecord(
        original_filename=file.filename,
        original_path=str(pdf_path),
        signed_filename=Path(result["output_path"]).name,
        signed_path=result["output_path"],
        certificate_id=certificate_id,
        signer_name=signer_name or cert.subject_cn,
        signature_type="visible" if visible else "invisible",
    )
    db.add(record)
    db.commit()

    # Get updated PDF info
    pdf_info = get_pdf_info(result["output_path"])

    return {
        "id": record.id,
        "signed_filename": record.signed_filename,
        "field_name": result["field_name"],
        "signer_name": result["signer_name"],
        "timestamp": result["timestamp"],
        "signature_box": result.get("signature_box", []),
        "timestamped": result.get("timestamped", False),
        "signature_number": result.get("signature_number", 1),
        "total_signatures": pdf_info["signature_count"],
        "download_url": f"/api/download/{record.id}",
    }


# ─── PKCS#11 Hardware Token Support ────────────────────────────

@app.get("/api/pkcs11/tokens")
def list_pkcs11_tokens(module_path: str):
    """List available PKCS#11 tokens/slots."""
    try:
        from .pkcs11_service import list_pkcs11_tokens
        tokens = list_pkcs11_tokens(module_path)
        return {"tokens": tokens}
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except ImportError:
        raise HTTPException(500, "python-pkcs11 is required for hardware token support. Install with: pip install python-pkcs11")
    except Exception as e:
        raise HTTPException(500, f"Failed to list tokens: {str(e)}")


@app.post("/api/sign/pkcs11")
async def sign_pdf_with_pkcs11(
    file: UploadFile = File(...),
    module_path: str = Form(...),
    token_label: str = Form(...),
    pin: str = Form(...),
    key_label: str = Form(""),
    signer_name: str = Form(""),
    visible: bool = Form(True),
    db: Session = Depends(get_db),
):
    """Sign a PDF using a PKCS#11 hardware token."""
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_PDF_EXTENSIONS:
        raise HTTPException(400, "Only PDF files are accepted")

    # Validate and save
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(413, f"File too large. Max: {MAX_UPLOAD_SIZE // 1024 // 1024}MB")
    if len(content) == 0:
        raise HTTPException(400, "Empty file")

    pdf_id = str(uuid.uuid4())
    pdf_path = UPLOADS_DIR / f"{pdf_id}_{file.filename}"
    with open(pdf_path, "wb") as f:
        f.write(content)

    # Sign with PKCS#11
    try:
        from .pkcs11_service import sign_pdf_with_pkcs11
        result = sign_pdf_with_pkcs11(
            pdf_path=str(pdf_path),
            module_path=module_path,
            token_label=token_label,
            pin=pin,
            key_label=key_label or None,
            signer_name=signer_name or "Hardware Token",
            visible=visible,
        )
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except ImportError:
        raise HTTPException(500, "python-pkcs11 is required. Install with: pip install python-pkcs11")
    except Exception as e:
        raise HTTPException(500, f"Signing failed: {str(e)}")

    # Record signing operation
    record = SigningRecord(
        original_filename=file.filename,
        original_path=str(pdf_path),
        signed_filename=Path(result["output_path"]).name,
        signed_path=result["output_path"],
        certificate_id="pkcs11",
        signer_name=signer_name or "Hardware Token",
        signature_type="visible" if visible else "invisible",
    )
    db.add(record)
    db.commit()

    return {
        "id": record.id,
        "signed_filename": record.signed_filename,
        "field_name": result["field_name"],
        "signer_name": result["signer_name"],
        "timestamp": result["timestamp"],
        "token_label": result.get("token_label", ""),
        "download_url": f"/api/download/{record.id}",
    }


# ─── Serve PDFs for preview ──────────────────────────────────────

@app.get("/api/preview/{record_id}")
async def preview_signed_pdf(record_id: str, db: Session = Depends(get_db)):
    """Serve a signed PDF for in-browser preview."""
    record = db.query(SigningRecord).filter(SigningRecord.id == record_id).first()
    if not record:
        raise HTTPException(404, "Signed PDF not found")

    if not os.path.exists(record.signed_path):
        raise HTTPException(404, "Signed file not found on disk")

    return FileResponse(
        record.signed_path,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{record.signed_filename}"'},
    )
