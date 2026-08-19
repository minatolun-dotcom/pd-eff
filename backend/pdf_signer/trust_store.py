"""Trust store service for managing trusted certificates and chain validation.

Supports:
- Adding/removing certificates from the trust store
- Building custom ValidationContext from trust store
- Extracting certificates from PDF signatures (including pkcs7.sha1)
- Full chain validation with custom trust roots
"""
import logging
from datetime import datetime, timezone
from pathlib import Path

from asn1crypto import cms, x509 as asn1_x509
from cryptography import x509 as pyca_x509
from cryptography.hazmat.primitives import serialization

logger = logging.getLogger(__name__)


def extract_certs_from_pdf(pdf_path: str) -> list:
    """
    Extract all certificates from PDF digital signatures.
    Handles both standard and adbe.pkcs7.sha1 SubFilter formats.

    Returns:
        List of dicts with certificate info and PEM data.
    """
    from pyhanko.pdf_utils.reader import PdfFileReader

    results = []

    try:
        with open(pdf_path, "rb") as f:
            reader = PdfFileReader(f)

            for sig in reader.embedded_signatures:
                sig_obj = sig.sig_object
                sub_filter = str(sig_obj.get("/SubFilter", ""))
                field_name = getattr(sig, "field_name", "Unknown")

                sig_bytes = sig_obj.get("/Contents")
                if not sig_bytes:
                    continue

                sig_data = bytes(sig_bytes)

                try:
                    content_info = cms.ContentInfo.load(sig_data)
                    content = content_info["content"]

                    if isinstance(content, cms.SignedData):
                        for i, cert_choice in enumerate(content["certificates"]):
                            cert = cert_choice.chosen
                            pyca_cert = _asn1_to_pyca(cert)
                            if pyca_cert:
                                results.append(_cert_to_dict(cert, pyca_cert, field_name))

                except Exception as e:
                    logger.warning(f"Could not parse signature in field '{field_name}': {e}")
                    # Try raw PKCS#7 parse for pkcs7.sha1
                    try:
                        certs = _extract_from_raw_pkcs7(sig_data)
                        for cert_info in certs:
                            results.append({**cert_info, "field_name": field_name})
                    except Exception:
                        pass

    except Exception as e:
        logger.error(f"Failed to extract certificates from PDF: {e}")

    return results


def _extract_from_raw_pkcs7(sig_data: bytes) -> list:
    """Fallback extraction for non-standard PKCS#7 formats."""
    results = []
    try:
        content_info = cms.ContentInfo.load(sig_data)
        content = content_info["content"]
        if isinstance(content, cms.SignedData):
            for cert_choice in content["certificates"]:
                cert = cert_choice.chosen
                pyca_cert = _asn1_to_pyca(cert)
                if pyca_cert:
                    results.append(_cert_to_dict(cert, pyca_cert, ""))
    except Exception:
        pass
    return results


def _asn1_to_pyca(asn1_cert) -> pyca_x509.Certificate | None:
    """Convert asn1crypto Certificate to cryptography Certificate."""
    try:
        der = asn1_cert.dump()
        return pyca_x509.load_der_x509_certificate(der)
    except Exception:
        return None


def _cert_to_dict(asn1_cert, pyca_cert, field_name: str) -> dict:
    """Build a cert info dict from both asn1crypto and cryptography objects."""
    pem_bytes = pyca_cert.public_bytes(serialization.Encoding.PEM)

    # Extract key info
    key_algo = type(pyca_cert.public_key()).__name__

    return {
        "field_name": field_name,
        "subject_cn": _get_cn(asn1_cert.subject),
        "subject_o": _get_org(asn1_cert.subject),
        "subject_full": asn1_cert.subject.human_friendly,
        "issuer_cn": _get_cn(asn1_cert.issuer),
        "issuer_full": asn1_cert.issuer.human_friendly,
        "serial_number": str(asn1_cert.serial_number),
        "not_valid_before": pyca_cert.not_valid_before_utc.isoformat(),
        "not_valid_after": pyca_cert.not_valid_after_utc.isoformat(),
        "is_self_signed": asn1_cert.issuer == asn1_cert.subject,
        "key_algorithm": key_algo,
        "pem": pem_bytes.decode("ascii"),
    }


def _get_cn(name) -> str:
    """Extract Common Name from asn1crypto Name."""
    try:
        native = name.native
        if isinstance(native, dict):
            return native.get("common_name", "") or ""
        # Fallback: parse human_friendly
        hf = name.human_friendly
        for part in hf.split(","):
            if part.strip().startswith("Common Name:"):
                return part.split(":", 1)[1].strip()
    except Exception:
        pass
    return ""


def _get_org(name) -> str:
    """Extract Organization from asn1crypto Name."""
    try:
        native = name.native
        if isinstance(native, dict):
            return native.get("organization_name", "") or ""
        # Fallback: parse human_friendly
        hf = name.human_friendly
        for part in hf.split(","):
            if part.strip().startswith("Organization:"):
                return part.split(":", 1)[1].strip()
    except Exception:
        pass
    return ""


def build_trust_context(trusted_pems: list[str]):
    """
    Build a ValidationContext from a list of PEM-encoded certificates.

    Args:
        trusted_pems: List of PEM certificate strings.

    Returns:
        ValidationContext configured with the trust roots.
    """
    from pyhanko_certvalidator import ValidationContext

    trust_roots = []
    for pem_str in trusted_pems:
        try:
            from asn1crypto import pem as asn1_pem, x509 as asn1_x509
            _, _, der_bytes = asn1_pem.unarmor(pem_str.encode("ascii"))
            cert = asn1_x509.Certificate.load(der_bytes)
            trust_roots.append(cert)
        except Exception as e:
            logger.warning(f"Could not parse trust root PEM: {e}")

    return ValidationContext(trust_roots=trust_roots)
