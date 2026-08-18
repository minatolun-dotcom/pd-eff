"""Certificate management utilities."""
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from .config import CERTS_DIR


def parse_pkcs12(pfx_path: str, passphrase: bytes) -> dict:
    """Parse a PKCS#12 file and extract certificate info."""
    from cryptography.hazmat.primitives.serialization import pkcs12

    with open(pfx_path, "rb") as f:
        pfx_data = f.read()

    private_key, certificate, chain = pkcs12.load_key_and_certificates(
        pfx_data, passphrase
    )

    if certificate is None:
        raise ValueError("No certificate found in the PKCS#12 file")

    subject = certificate.subject
    issuer = certificate.issuer

    # Extract common name and organization
    cn = _get_attribute(subject, NameOID.COMMON_NAME)
    org = _get_attribute(subject, NameOID.ORGANIZATION_NAME)
    issuer_cn = _get_attribute(issuer, NameOID.COMMON_NAME)

    return {
        "subject_cn": cn,
        "subject_o": org,
        "issuer_cn": issuer_cn,
        "serial_number": str(certificate.serial_number),
        "not_valid_before": certificate.not_valid_before_utc.replace(tzinfo=None),
        "not_valid_after": certificate.not_valid_after_utc.replace(tzinfo=None),
        "key_algorithm": type(private_key).__name__,
        "is_self_signed": _is_self_signed(certificate),
        "certificate": certificate,
        "private_key": private_key,
        "chain": chain or [],
    }


def generate_self_signed_cert(
    common_name: str = "Test Signer",
    organization: str = "PDF Signer App",
    valid_days: int = 365,
    key_size: int = 2048,
) -> dict:
    """Generate a self-signed certificate for testing purposes."""
    # Generate private key
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=key_size,
    )

    # Build certificate
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, organization),
    ])

    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=valid_days))
        # Add key usage for digital signatures
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=True,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.BasicConstraints(ca=False, path_length=None),
            critical=True,
        )
        .sign(private_key, hashes.SHA256())
    )

    # Save to disk
    cert_id = str(uuid.uuid4())
    cert_dir = CERTS_DIR / cert_id
    cert_dir.mkdir(parents=True, exist_ok=True)

    # Save private key
    key_path = cert_dir / "key.pem"
    with open(key_path, "wb") as f:
        f.write(
            private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )

    # Save certificate
    cert_path = cert_dir / "cert.pem"
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    # Create PKCS#12 bundle
    from cryptography.hazmat.primitives.serialization import pkcs12

    pfx_path = cert_dir / f"{common_name.replace(' ', '_')}.p12"
    pfx_data = pkcs12.serialize_key_and_certificates(
        name=common_name.encode(),
        key=private_key,
        cert=cert,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(b"password"),
    )
    with open(pfx_path, "wb") as f:
        f.write(pfx_data)

    return {
        "cert_id": cert_id,
        "subject_cn": common_name,
        "subject_o": organization,
        "issuer_cn": common_name,
        "serial_number": str(cert.serial_number),
        "not_valid_before": cert.not_valid_before_utc.replace(tzinfo=None),
        "not_valid_after": cert.not_valid_after_utc.replace(tzinfo=None),
        "key_algorithm": "RSA",
        "is_self_signed": True,
        "pfx_path": str(pfx_path),
        "pfx_passphrase": "password",
    }


def _get_attribute(name: x509.Name, oid) -> str:
    """Get an attribute value from an X.509 Name."""
    try:
        return name.get_attributes_for_oid(oid)[0].value
    except (IndexError, Exception):
        return ""


def _is_self_signed(cert: x509.Certificate) -> bool:
    """Check if a certificate is self-signed."""
    return cert.issuer == cert.subject
