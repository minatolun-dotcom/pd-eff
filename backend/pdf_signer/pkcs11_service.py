"""PKCS#11 hardware token support for USB security keys and smart cards.

Supports:
- Token discovery and listing
- Key and certificate enumeration
- PDF signing via hardware tokens
"""
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .config import SIGNED_DIR


def list_pkcs11_tokens(module_path: str) -> list:
    """
    List all available PKCS#11 tokens/slots.

    Args:
        module_path: Path to the PKCS#11 shared library (.so/.dll/.dylib).

    Returns:
        List of token info dicts with keys:
        - slot_id, label, serial_number, model, manufacturer, has_keypad
        - keys: list of available key labels
    """
    if not os.path.exists(module_path):
        raise FileNotFoundError(f"PKCS#11 module not found: {module_path}")

    try:
        import pkcs11
        from pkcs11 import lib as pkcs11_lib, Mechanism, ObjectClass, KeyType
    except ImportError:
        raise ImportError(
            "python-pkcs11 is required for hardware token support. "
            "Install with: pip install python-pkcs11"
        )

    pkcs11_mod = pkcs11_lib.Module(module_path)
    tokens = []

    for slot in pkcs11_mod.get_slots():
        try:
            token = slot.get_token()
            info = token.token_info

            # Enumerate keys on the token
            keys = _enumerate_keys(token)

            tokens.append({
                "slot_id": slot.slot_id,
                "label": info.label.strip(),
                "serial_number": info.serial_number.strip(),
                "model": info.model.strip(),
                "manufacturer": info.manufacturer_id.strip(),
                "has_keypad": info.has_keypad,
                "max_pin_length": info.max_pin_len,
                "min_pin_length": info.min_pin_len,
                "keys": keys,
            })
        except Exception:
            # Slot has no token or token is not accessible
            continue

    return tokens


def _enumerate_keys(token) -> list:
    """Enumerate signing keys and certificates on a PKCS#11 token."""
    try:
        from pkcs11 import ObjectClass, Mechanism, KeyType

        keys = []

        # Find private keys (signing keys)
        try:
            private_keys = token.get_all_objects(
                object_class=ObjectClass.PRIVATE_KEY,
            )
            for key in private_keys:
                attrs = key.get_attributes()
                label = attrs.get("LABEL", b"").decode("utf-8", errors="replace")
                key_type = attrs.get("KEY_TYPE", None)
                key_id = attrs.get("ID", b"").hex()

                keys.append({
                    "label": label,
                    "type": _key_type_name(key_type),
                    "id": key_id,
                    "can_sign": True,
                })
        except Exception:
            pass

        # Find certificates
        try:
            certs = token.get_all_objects(
                object_class=ObjectClass.CERTIFICATE,
            )
            for cert in certs:
                attrs = cert.get_attributes()
                label = attrs.get("LABEL", b"").decode("utf-8", errors="replace")
                cert_id = attrs.get("ID", b"").hex()

                # Try to extract subject from cert data
                try:
                    cert_data = cert.get_attributes()["VALUE"]
                    from asn1crypto import x509
                    cert_obj = x509.Certificate.load(cert_data)
                    subject_cn = ""
                    for attr in cert_obj.subject:
                        if attr.native and attr.oid.dotted_string == "2.5.4.3":
                            subject_cn = attr.native
                            break
                except Exception:
                    subject_cn = "Unknown"

                # Check if there's a matching private key
                has_private_key = any(k["id"] == cert_id for k in keys)

                keys.append({
                    "label": label,
                    "type": "certificate",
                    "id": cert_id,
                    "subject_cn": subject_cn,
                    "has_private_key": has_private_key,
                })
        except Exception:
            pass

        return keys

    except Exception:
        return []


def _key_type_name(key_type) -> str:
    """Convert PKCS#11 key type to human-readable name."""
    try:
        from pkcs11 import KeyType
        mapping = {
            KeyType.RSA: "RSA",
            KeyType.ECDSA: "ECDSA",
            KeyType.DSA: "DSA",
        }
        return mapping.get(key_type, str(key_type))
    except Exception:
        return "Unknown"


def get_pkcs11_signer(
    module_path: str,
    token_label: str,
    pin: str,
    key_label: str = None,
    certificate_label: str = None,
):
    """
    Create a PyHanko SimpleSigner from a PKCS#11 hardware token.

    Args:
        module_path: Path to the PKCS#11 shared library.
        token_label: Label of the token/slot to use.
        pin: PIN for the token.
        key_label: Label of the private key to use.
        certificate_label: Label of the certificate to use (if different from key).

    Returns:
        SimpleSigner configured for PKCS#11.
    """
    from pyhanko.sign.signers import SimpleSigner

    signer = SimpleSigner.load_pkcs11(
        module=module_path,
        label=token_label,
        pin=pin.encode() if isinstance(pin, str) else pin,
        key_label=key_label or certificate_label,
        cert_label=certificate_label,
    )
    return signer


def sign_pdf_with_pkcs11(
    pdf_path: str,
    module_path: str,
    token_label: str,
    pin: str,
    key_label: str = None,
    certificate_label: str = None,
    signer_name: str = "",
    visible: bool = True,
    page: int = 0,
    sig_field_name: str = None,
    signature_box: tuple = None,
    stamp_text: str = None,
    timestamp_url: str = None,
) -> dict:
    """
    Sign a PDF using a PKCS#11 hardware token.

    Args:
        pdf_path: Path to the PDF to sign.
        module_path: Path to the PKCS#11 shared library.
        token_label: Label of the token/slot.
        pin: PIN for the token.
        key_label: Optional label of the private key.
        certificate_label: Optional label of the certificate.
        signer_name: Name to display in the signature field.
        visible: Whether the signature should be visible.
        page: Page number for visible signature (0-indexed).
        sig_field_name: Name for the signature field.
        signature_box: Custom position (x1, y1, x2, y2) for visible signature.
        stamp_text: Custom stamp text. If None, uses default format.
        timestamp_url: RFC 3161 timestamp server URL for long-term validation.

    Returns:
        dict with signed file info and metadata.
    """
    # Get signer from hardware token
    signer = get_pkcs11_signer(module_path, token_label, pin, key_label, certificate_label)

    # Configure signature metadata
    from pyhanko.sign.signers import PdfSignatureMetadata
    field_name = sig_field_name or f"Signature_{uuid.uuid4().hex[:8]}"
    sig_meta = PdfSignatureMetadata(field_name=field_name)

    # Generate timestamp
    sig_timestamp = datetime.now(timezone.utc)

    # Output path
    output_path = _get_output_path(pdf_path)

    # Default signature box position
    if signature_box is None:
        signature_box = (350, 20, 550, 80)

    # Read PDF and sign
    from pyhanko.sign import signers as signers_mod, fields as sig_fields
    from pyhanko.sign.fields import SigFieldSpec
    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
    from pyhanko import stamp as stamp_mod

    with open(pdf_path, "rb") as inf:
        w = IncrementalPdfFileWriter(inf)

        # Add signature field if visible
        if visible:
            sig_field_spec = SigFieldSpec(
                sig_field_name=field_name,
                on_page=page,
                box=signature_box,
            )
            sig_fields.append_signature_field(w, sig_field_spec)

        # Build stamp text
        if stamp_text is None:
            stamp_text = f"Digitally signed by: {signer_name or 'Hardware Token'}"

        # Configure timestamp if URL provided
        stamp_style = stamp_mod.TextStampStyle(
            stamp_text=stamp_text,
        ) if visible else None

        with open(output_path, "wb") as outf:
            pdf_signer = signers_mod.PdfSigner(
                sig_meta,
                signer=signer,
                stamp_style=stamp_style,
            )
            pdf_signer.sign_pdf(w, output=outf)

    return {
        "output_path": output_path,
        "field_name": field_name,
        "signer_name": signer_name or "Hardware Token",
        "timestamp": sig_timestamp.isoformat(),
        "visible": visible,
        "token_label": token_label,
    }


def _get_output_path(original_path: str) -> str:
    """Generate output path for signed PDF."""
    original = Path(original_path)
    output_name = f"signed_{uuid.uuid4().hex[:8]}_{original.name}"
    return str(SIGNED_DIR / output_name)
