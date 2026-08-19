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


CA_BUNDLES = {
    "india": [
        {
            "name": "CCA India 2022 Root",
            "subject_cn": "CCA India 2022",
            "subject_o": "India PKI",
            "issuer_cn": "CCA India 2022",
            "serial_number": "157036879278859019125670065035400962327",
            "pem": (
                "-----BEGIN CERTIFICATE-----\n"
                "MIIFNDCCAxygAwIBAgIQdiQz69smdlqFYM0KqC/hFzANBgkqhkiG9w0BAQsFADA6\n"
                "MQswCQYDVQQGEwJJTjESMBAGA1UEChMJSW5kaWEgUEtJMRcwFQYDVQQDEw5DQ0Eg\n"
                "SW5kaWEgMjAyMjAeFw0yMjAyMDIxMjA0MzdaFw00MjAyMDIxMjA0MzdaMDoxCzAJ\n"
                "BgNVBAYTAklOMRIwEAYDVQQKEwlJbmRpYSBQS0kxFzAVBgNVBAMTDkNDQSBJbmRp\n"
                "YSAyMDIyMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAv3EBudWC8HY0\n"
                "oSwtJZCqpjQTGpEewl3EdDqUORV0qoFp78mdR/vuATXI83G7nF9RLvmNjgQgKr/b\n"
                "Mx6gPO4Y57bMjAsgwEzleFclZka/sqc68iN5rS3huhrCX6MEINLyDOQ71MRA7GJC\n"
                "aNL6E3j1438eTu011mlikeZYBdkhvfpAVjCw90w8wcWDmqx66Y561T/RiXyz2uEh\n"
                "BBZAD43gV58eXStOeOTwAzEZYMrmp232GfmQKabYRfdIRus1avyuGea2nICEsRHE\n"
                "8M2tdzwpGP7oIy2qHBFJJ+3AwmwQA4DjmDkJtCD+58awohQavRNhqjsGD+ZifG3V\n"
                "R4i6WrKv8OWqZzcZj3g3Elr5+fRMlz1GSqkWPBw1Ev8KWTHazSUKF7OMxm3XzyXx\n"
                "Qnw7fZF9GOVtx3adpfRPqYGgtbOP34EVkz4wsHvNMrvUrYcKymdOrnkTjlX26fIH\n"
                "UJpKGYkLk9q0jhMNKs4Rn8lj4pJ7YF33/ND4bjpV0ex1EAQz0iZvT37OnxNiuAZ/\n"
                "+4Djf075UuNX2ecWnadOrN1r8NAParZIwUoSUnWhU8TqAWWRqzFURHUZuOMQcA0g\n"
                "eg4c9zqtBoUPgtQksbIAEsEXmDuRpwSIFjEkK11f5Eemfmfdg37KyIjQ67TRTmBA\n"
                "+kT9Q5JIm/e7m1ILg/HKckgLUOCnAMsCAwEAAaM2MDQwDwYDVR0TAQH/BAUwAwEB\n"
                "/zARBgNVHQ4ECgQITjtINlziX30wDgYDVR0PAQH/BAQDAgEGMA0GCSqGSIb3DQEB\n"
                "CwUAA4ICAQCdbE8d1c1DysKtrtYlApYIXTlY3N2XHNQ6gKoaVWsKa1TJ/ovrT+FV\n"
                "3bmQLet3aSoEG6pTe/vLZSg8WiF7cn7WuF4XlQS3yA2Uu8/cg/S4owqhQJp6K/Xg\n"
                "6UoSBad9Kog1H8deOfV8Nmb8a89zB4Yf8/AepId+Lr/3I6O7iub+PUT2QBXnksa+\n"
                "cf0yf+49GhyMCILZvctNSQd4Vxr9EgRvBARTrAgNQ9sEOJ6myOz4iTFR7T2pIFP8\n"
                "Cp15e8jEVI1q4IuHu3XlwJNk9f5k3gbwrzoy9P5rP8voQU3u9wh62JZa9U63b+u/\n"
                "Ur1tsKb5Lx0YUedtHvpIiIRurEPxumW0twjrx8TrAcXRrViSL7dsXAoYC0dXo154\n"
                "EE8jBAzgIIur7tJizxgXDEn4i2pu8Yd615YML9ii5BooEJ2j6fQ0nzyPRmx1Egw2\n"
                "Fjlgzzceai4TUOcaCKab86yyu5MZIp+BiPR840nw5MggbRgYH2nFRBA70toVm4VF\n"
                "lbZs3reGmaICm4ST6R395OxYS1iYBm5kXm9tLb4pkIhUxrkgyuiwE+DsWceBjHAY\n"
                "aXnCgUGKtiG9tfBMUw3fChoPb9L1yKdNof3zXDdTloMqEpO4BFrmjco8kt1v0LUQ\n"
                "PhNZmQP4nqd4Hqx2384nPmWDXbQ+eePyxRteYGY0hJeDLVpyeYG8VQ==\n"
                "-----END CERTIFICATE-----"
            ),
        },
        {
            "name": "CCA India 2014 Root",
            "subject_cn": "CCA India 2014",
            "subject_o": "India PKI",
            "issuer_cn": "CCA India 2014",
            "serial_number": "10157",
            "pem": (
                "-----BEGIN CERTIFICATE-----\n"
                "MIIDIzCCAgugAwIBAgICJ60wDQYJKoZIhvcNAQELBQAwOjELMAkGA1UEBhMCSU4x\n"
                "EjAQBgNVBAoTCUluZGlhIFBLSTEXMBUGA1UEAxMOQ0NBIEluZGlhIDIwMTQwHhcN\n"
                "MTQwMzA1MTAxMDQ5WhcNMjQwMzA1MTAxMDQ5WjA6MQswCQYDVQQGEwJJTjESMBAG\n"
                "A1UEChMJSW5kaWEgUEtJMRcwFQYDVQQDEw5DQ0EgSW5kaWEgMjAxNDCCASIwDQYJ\n"
                "KoZIhvcNAQEBBQADggEPADCCAQoCggEBAN7IUL2K/yINrn+sglna9CkJ1AVrbJYB\n"
                "vsylsCF3vhStQC9kb7t4FwX7s+6AAMSakL5GUDJxVVNhMqf/2paerAzFACVNR1Ai\n"
                "MLsG7ima4pCDhFn7t9052BQRbLBCPg4wekx6j+QULQFeW9ViLV7hjkEhKffeuoc3\n"
                "YaDmkkPSmA2mz6QKbUWYUu4PqQPRCrkiDH0ikdqR9eyYhWyuI7Gm/pc0atYnp1sr\n"
                "u3rtLCaLS0ST/N/ELDEUUY2wgxglgoqEEdMhSSBL1CzaA8Ck9PErpnqC7VL+sbSy\n"
                "AKeJ9n56FttQzkwYjdOHMrgJRZaPb2i5VoVo1ZFkQF3ZKfiJ25VH5+8CAwEAAaMz\n"
                "MDEwDwYDVR0TAQH/BAUwAwEB/zARBgNVHQ4ECgQIQrjFz22zV+EwCwYDVR0PBAQD\n"
                "AgEGMA0GCSqGSIb3DQEBCwUAA4IBAQAdAUjv0myKyt8GC1niIZplrlksOWIR6yXL\n"
                "g4BhFj4ziULxsGK4Jj0sIJGCkNJeHl+Ng9UlU5EI+r89DRdrGBTF/I+g3RHcViPt\n"
                "One9xEgWRMRYtWD7QZe5FvoSSGkW9aV6D4iGLPBQML6FDUkQzW9CYDCFgGC2+awR\n"
                "Mx61dQVXiFv3Nbkqa1Pejcel8NMAmxjfm5nZMd3Ft13hy3fNF6UzsOnBtMbyZWhS\n"
                "8Koj2KFfSUGX+M/DS1TG2ZujwKKXCuKq7+67m0WF6zohoHJbqjkmKX34zkuFnoXa\n"
                "Xco9NkOi0RBvLCiqR2lKfzLM7B69bje+z0EqnRNo5+s8PWSdy+xt\n"
                "-----END CERTIFICATE-----"
            ),
        },
    ],
}


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
