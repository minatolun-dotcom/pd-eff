"""PDF signature verification service using PyHanko."""
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.sign.validation.settings import KeyUsageConstraints
from pyhanko_certvalidator import ValidationContext

logger = logging.getLogger(__name__)


def verify_pdf(pdf_path: str, trust_roots: list = None) -> dict:
    """
    Verify digital signatures in a PDF file.

    Args:
        pdf_path: Path to the PDF to verify.
        trust_roots: Optional list of trusted root certificates (PEM bytes).
                     If None, uses a minimal trust store.

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

            # embedded_signatures is a list of EmbeddedPdfSignature objects
            sig_list = reader.embedded_signatures
            results["signature_count"] = len(sig_list)

            if not sig_list:
                results["overall_status"] = "NO_SIGNATURES"
                return results

            # Validate each signature
            all_valid = True
            for sig_obj in sig_list:
                sig_result = _validate_single_signature(
                    reader, sig_obj, trust_roots
                )
                results["signatures"].append(sig_result)

                if not sig_result["intact"] or not sig_result["valid"]:
                    all_valid = False

            results["is_valid"] = all_valid
            results["overall_status"] = "VALID" if all_valid else "INVALID"

    except Exception as e:
        results["overall_status"] = "ERROR"
        results["error"] = str(e)
        results["is_valid"] = False

    return results


def _validate_single_signature(
    reader, sig_obj, trust_roots
) -> dict:
    """Validate a single PDF signature."""
    # Get field name from the EmbeddedPdfSignature
    field_name = getattr(sig_obj, "field_name", None) or "Unknown"

    sig_info = {
        "field_name": field_name,
        "intact": False,
        "valid": False,
        "trust_status": "UNKNOWN",
        "signer": {},
        "timestamps": {},
        "details": {},
        "errors": [],
    }

    try:
        # Build validation context
        vc = ValidationContext(trust_roots=trust_roots or [])

        # Validate the signature
        status = validate_pdf_signature(
            sig_obj,
            vc,
            key_usage_settings=KeyUsageConstraints(
                key_usage={"digital_signature", "non_repudiation"},
            ),
        )

        sig_info["intact"] = status.intact
        sig_info["valid"] = status.valid

        # Determine trust status from trust_problem_indic
        trust_problem = getattr(status, "trust_problem_indic", None)
        if trust_problem is not None:
            if "NONE" in str(trust_problem).upper() or "OK" in str(trust_problem).upper():
                sig_info["trust_status"] = "VALID"
            else:
                sig_info["trust_status"] = f"TRUST_ISSUE ({trust_problem})"
        else:
            sig_info["trust_status"] = "VALID" if status.valid else "UNTRUSTED"

        # Extract signer info from signing_cert (asn1crypto type)
        signer_cert = getattr(status, "signing_cert", None)
        if signer_cert:
            subject = signer_cert.subject
            issuer = signer_cert.issuer

            # Get validity dates
            valid_from = None
            valid_to = None
            try:
                vf = getattr(signer_cert, "not_valid_before", None)
                vt = getattr(signer_cert, "not_valid_after", None)
                if vf is not None:
                    valid_from = vf.isoformat() if hasattr(vf, "isoformat") else str(vf)
                if vt is not None:
                    valid_to = vt.isoformat() if hasattr(vt, "isoformat") else str(vt)
            except Exception:
                pass

            sig_info["signer"] = {
                "common_name": _get_asn1_attr(subject, "common_name"),
                "organization": _get_asn1_attr(subject, "organization_name"),
                "email": _get_asn1_attr(subject, "email_address"),
                "issuer_cn": _get_asn1_attr(issuer, "common_name"),
                "serial_number": str(signer_cert.serial_number),
                "valid_from": valid_from,
                "valid_to": valid_to,
                "self_signed": signer_cert.issuer == signer_cert.subject,
            }

        # Extract timestamps
        sig_info["timestamps"] = {
            "signing_time": _get_signing_time(sig_obj),
        }

        # Get signature field properties from sig_object
        try:
            sig_dict = sig_obj.sig_object
            sig_info["details"] = {
                "field_name": field_name,
                "filter": _safe_get(sig_dict, "/Filter", "Unknown"),
                "sub_filter": _safe_get(sig_dict, "/SubFilter", "Unknown"),
                "byte_range": _safe_get(sig_dict, "/ByteRange", "[]"),
                "reason": _safe_get(sig_dict, "/Reason", ""),
                "location": _safe_get(sig_dict, "/Location", ""),
                "contact_info": _safe_get(sig_dict, "/ContactInfo", ""),
            }
        except Exception:
            sig_info["details"] = {"field_name": field_name}

    except Exception as e:
        sig_info["errors"].append(str(e))
        sig_info["trust_status"] = "ERROR"

    return sig_info


def _safe_get(d, key, default=""):
    """Safely get a value from a PDF dictionary object."""
    try:
        val = d.get(key, default) if hasattr(d, "get") else default
        return str(val)
    except Exception:
        return str(default)


def _get_asn1_attr(name, friendly_name: str) -> str:
    """Extract an attribute from an asn1crypto Name using human_friendly."""
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
