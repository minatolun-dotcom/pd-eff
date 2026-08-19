"""PDF signature verification service using PyHanko.

Supports:
- Standard signature validation
- adbe.pkcs7.sha1 SubFilter (older Adobe format)
- Custom trust store validation
- Full certificate chain extraction
"""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.sign.validation.settings import KeyUsageConstraints
from pyhanko_certvalidator import ValidationContext

logger = logging.getLogger(__name__)


def verify_pdf(pdf_path: str, trust_roots: list = None, trusted_pems: list = None) -> dict:
    """
    Verify digital signatures in a PDF file.

    Args:
        pdf_path: Path to the PDF to verify.
        trust_roots: Optional list of DER-encoded trusted root certificates.
        trusted_pems: Optional list of PEM strings to build trust context.

    Returns:
        dict with verification results including signature details.
    """
    results = {
        "filename": Path(pdf_path).name,
        "is_valid": False,
        "signature_count": 0,
        "signatures": [],
        "overall_status": "NO_SIGNATURES",
        "verified_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        with open(pdf_path, "rb") as f:
            reader = PdfFileReader(f)
            sig_list = reader.embedded_signatures
            results["signature_count"] = len(sig_list)

            if not sig_list:
                results["overall_status"] = "NO_SIGNATURES"
                return results

            # Build validation context
            if trusted_pems:
                vc = _build_vc_from_pems(trusted_pems)
            elif trust_roots:
                vc = ValidationContext(trust_roots=trust_roots)
            else:
                vc = ValidationContext(trust_roots=[])

            all_valid = True
            for sig_obj in sig_list:
                sig_result = _validate_single_signature(reader, sig_obj, vc)
                results["signatures"].append(sig_result)

                # For trust status: if intact but untrusted, that's a specific state
                if not sig_result["intact"]:
                    all_valid = False
                # If intact but trust_status is not VALID, mark as partially valid
                elif sig_result.get("trust_status") not in ("VALID", ""):
                    all_valid = False

            results["is_valid"] = all_valid
            results["overall_status"] = "VALID" if all_valid else "INVALID"

    except Exception as e:
        results["overall_status"] = "ERROR"
        results["error"] = str(e)
        results["is_valid"] = False

    return results


def _validate_single_signature(reader, sig_obj, vc) -> dict:
    """Validate a single PDF signature."""
    field_name = getattr(sig_obj, "field_name", None) or "Unknown"
    sub_filter = str(sig_obj.sig_object.get("/SubFilter", ""))

    sig_info = {
        "field_name": field_name,
        "sub_filter": sub_filter,
        "intact": False,
        "valid": False,
        "trust_status": "UNKNOWN",
        "signer": {},
        "timestamps": {},
        "details": {},
        "errors": [],
        "certificates": [],
    }

    try:
        from pyhanko.sign.validation.settings import KeyUsageConstraints
        import concurrent.futures

        def _validate():
            return validate_pdf_signature(
                sig_obj,
                vc,
                key_usage_settings=KeyUsageConstraints(
                    key_usage={"digital_signature", "non_repudiation"},
                ),
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            status = pool.submit(_validate).result(timeout=15)

        sig_info["intact"] = status.intact
        sig_info["valid"] = status.valid

        # Trust status
        trust_problem = getattr(status, "trust_problem_indic", None)
        if trust_problem is not None:
            trust_str = str(trust_problem)
            if "NONE" in trust_str.upper() or "OK" in trust_str.upper():
                sig_info["trust_status"] = "VALID"
            else:
                sig_info["trust_status"] = f"UNTRUSTED ({trust_str})"
        else:
            sig_info["trust_status"] = "VALID" if status.valid else "UNTRUSTED"

        # Extract signer info
        signer_cert = getattr(status, "signing_cert", None)
        if signer_cert:
            sig_info["signer"] = _extract_signer_info(signer_cert)

        # Extract all certificates from the chain
        sig_info["certificates"] = _extract_certificates_from_sig(sig_obj)

        # Timestamps
        sig_info["timestamps"] = {
            "signing_time": _get_signing_time(sig_obj),
        }

        # Signature field details
        try:
            sig_dict = sig_obj.sig_object
            sig_info["details"] = {
                "field_name": field_name,
                "filter": _safe_get(sig_dict, "/Filter", "Unknown"),
                "sub_filter": sub_filter,
                "reason": _safe_get(sig_dict, "/Reason", ""),
                "location": _safe_get(sig_dict, "/Location", ""),
                "contact_info": _safe_get(sig_dict, "/ContactInfo", ""),
            }
        except Exception:
            sig_info["details"] = {"field_name": field_name}

    except Exception as e:
        err_str = str(e)
        sig_info["errors"].append(err_str)

        # If the SubFilter is not recognized, try raw extraction
        if "not a recognized SubFilter" in err_str or "pkcs7.sha1" in sub_filter.lower():
            sig_info["trust_status"] = "UNTRUSTED (legacy format)"
            sig_info["certificates"] = _extract_certificates_from_sig(sig_obj)

            # Try to extract signer info from raw PKCS#7
            try:
                signer_info = _extract_signer_from_raw(sig_obj)
                if signer_info:
                    sig_info["signer"] = signer_info
            except Exception:
                pass
        else:
            sig_info["trust_status"] = "ERROR"

    return sig_info


def _extract_signer_info(cert) -> dict:
    """Extract signer information from an asn1crypto certificate."""
    try:
        from cryptography import x509 as pyca_x509
        from cryptography.hazmat.primitives import serialization

        der = cert.dump()
        pyca_cert = pyca_x509.load_der_x509_certificate(der)

        valid_from = pyca_cert.not_valid_before_utc.isoformat() if hasattr(pyca_cert.not_valid_before_utc, 'isoformat') else str(pyca_cert.not_valid_before_utc)
        valid_to = pyca_cert.not_valid_after_utc.isoformat() if hasattr(pyca_cert.not_valid_after_utc, 'isoformat') else str(pyca_cert.not_valid_after_utc)

        return {
            "common_name": _get_asn1_attr(cert.subject, "common_name"),
            "organization": _get_asn1_attr(cert.subject, "organization_name"),
            "email": _get_asn1_attr(cert.subject, "email_address"),
            "country": _get_asn1_attr(cert.subject, "country_name"),
            "issuer_cn": _get_asn1_attr(cert.issuer, "common_name"),
            "issuer_organization": _get_asn1_attr(cert.issuer, "organization_name"),
            "serial_number": str(cert.serial_number),
            "valid_from": valid_from,
            "valid_to": valid_to,
            "self_signed": cert.issuer == cert.subject,
            "pem": pyca_cert.public_bytes(serialization.Encoding.PEM).decode("ascii"),
        }
    except Exception:
        return {
            "common_name": _get_asn1_attr(cert.subject, "common_name"),
            "issuer_cn": _get_asn1_attr(cert.issuer, "common_name"),
            "serial_number": str(cert.serial_number),
            "self_signed": cert.issuer == cert.subject,
        }


def _extract_certificates_from_sig(sig_obj) -> list:
    """Extract all certificates embedded in the signature."""
    certs = []
    try:
        sig_dict = sig_obj.sig_object
        sig_bytes = sig_dict.get("/Contents")
        if not sig_bytes:
            return certs

        from asn1crypto import cms, x509 as asn1_x509
        content_info = cms.ContentInfo.load(bytes(sig_bytes))
        content = content_info["content"]

        if isinstance(content, cms.SignedData):
            for cert_choice in content["certificates"]:
                cert = cert_choice.chosen
                # Handle both Certificate objects and raw bytes
                if isinstance(cert, asn1_x509.Certificate):
                    certs.append({
                        "subject_cn": _get_asn1_attr(cert.subject, "common_name"),
                        "subject_full": cert.subject.human_friendly,
                        "issuer_cn": _get_asn1_attr(cert.issuer, "common_name"),
                        "issuer_full": cert.issuer.human_friendly,
                        "serial_number": str(cert.serial_number),
                        "is_self_signed": cert.issuer == cert.subject,
                    })
                elif isinstance(cert, bytes):
                    # Try to parse raw bytes as DER certificate
                    try:
                        pyca_cert = pyca_x509.load_der_x509_certificate(cert)
                        from cryptography.hazmat.primitives import serialization
                        pem = pyca_cert.public_bytes(serialization.Encoding.PEM).decode()
                        subject = pyca_cert.subject
                        issuer = pyca_cert.issuer
                        cn = ""
                        org = ""
                        for attr in subject:
                            if attr.oid.dotted_string == "2.5.4.3":
                                cn = attr.value
                            elif attr.oid.dotted_string == "2.5.4.10":
                                org = attr.value
                        issuer_cn = ""
                        for attr in issuer:
                            if attr.oid.dotted_string == "2.5.4.3":
                                issuer_cn = attr.value
                                break
                        certs.append({
                            "subject_cn": cn,
                            "subject_full": subject.rfc4514_string(),
                            "issuer_cn": issuer_cn,
                            "issuer_full": issuer.rfc4514_string(),
                            "serial_number": str(pyca_cert.serial_number),
                            "is_self_signed": pyca_cert.issuer == pyca_cert.subject,
                            "pem": pem,
                        })
                    except Exception:
                        pass
    except Exception as e:
        logger.debug(f"Could not extract certificates: {e}")

    return certs


def _extract_signer_from_raw(sig_obj) -> dict | None:
    """Extract signer info from raw PKCS#7 bytes."""
    try:
        from asn1crypto import cms, x509 as asn1_x509
        sig_dict = sig_obj.sig_object
        sig_bytes = sig_dict.get("/Contents")
        if not sig_bytes:
            return None

        content_info = cms.ContentInfo.load(bytes(sig_bytes))
        content = content_info["content"]

        if isinstance(content, cms.SignedData):
            certs = content["certificates"]
            if certs:
                signer_cert = certs[-1].chosen
                if isinstance(signer_cert, asn1_x509.Certificate):
                    return {
                        "common_name": _get_asn1_attr(signer_cert.subject, "common_name"),
                        "organization": _get_asn1_attr(signer_cert.subject, "organization_name"),
                        "issuer_cn": _get_asn1_attr(signer_cert.issuer, "common_name"),
                        "serial_number": str(signer_cert.serial_number),
                        "self_signed": signer_cert.issuer == signer_cert.subject,
                    }
                elif isinstance(signer_cert, bytes):
                    pyca_cert = pyca_x509.load_der_x509_certificate(signer_cert)
                    cn = ""
                    org = ""
                    issuer_cn = ""
                    for attr in pyca_cert.subject:
                        if attr.oid.dotted_string == "2.5.4.3":
                            cn = attr.value
                        elif attr.oid.dotted_string == "2.5.4.10":
                            org = attr.value
                    for attr in pyca_cert.issuer:
                        if attr.oid.dotted_string == "2.5.4.3":
                            issuer_cn = attr.value
                            break
                    return {
                        "common_name": cn,
                        "organization": org,
                        "issuer_cn": issuer_cn,
                        "serial_number": str(pyca_cert.serial_number),
                        "self_signed": pyca_cert.issuer == pyca_cert.subject,
                    }
    except Exception:
        pass
    return None


def _build_vc_from_pems(pem_list: list[str]) -> ValidationContext:
    """Build ValidationContext from PEM strings."""
    trust_roots = []
    for pem_str in pem_list:
        try:
            from asn1crypto import pem as asn1_pem, x509 as asn1_x509
            _, _, der_bytes = asn1_pem.unarmor(pem_str.encode("ascii"))
            # pyhanko_certvalidator expects asn1crypto Certificate objects
            cert = asn1_x509.Certificate.load(der_bytes)
            trust_roots.append(cert)
        except Exception as e:
            logger.warning(f"Could not parse PEM: {e}")

    return ValidationContext(trust_roots=trust_roots)


def _safe_get(d, key, default=""):
    """Safely get a value from a PDF dictionary object."""
    try:
        val = d.get(key, default) if hasattr(d, "get") else default
        return str(val)
    except Exception:
        return str(default)


def _get_asn1_attr(name, friendly_name: str) -> str:
    """Extract an attribute from an asn1crypto Name."""
    try:
        hf = name.human_friendly
        parts = [p.strip() for p in hf.split(",")]
        for part in parts:
            if ":" in part:
                key, val = part.split(":", 1)
                if key.strip().lower() == friendly_name.replace("_", " ").lower():
                    return val.strip()
        return ""
    except Exception:
        return ""


def _get_signing_time(sig_obj) -> str:
    """Extract signing time from signature object."""
    try:
        sig_dict = sig_obj.sig_object
        if hasattr(sig_dict, "get"):
            val = sig_dict.get("/M", None)
            if val is not None:
                return str(val)
    except Exception:
        pass
    return "Unknown"
