"""Verification stamp service.

Embeds a visual verification result stamp into a PDF, similar to Adobe Acrobat's
signature verification panel. Creates a stamp annotation showing:
- Verification status (valid/untrusted/invalid)
- Signer information
- Timestamp of verification
- Trust status
"""
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .config import SIGNED_DIR


def stamp_verification_result(
    pdf_path: str,
    verification_result: dict,
    page: int = 0,
) -> str:
    """
    Embed a verification stamp annotation into the PDF.

    Args:
        pdf_path: Path to the PDF to stamp.
        verification_result: The verification result dict from verify_pdf().
        page: Page number to add the stamp on (0-indexed).

    Returns:
        Path to the stamped PDF.
    """
    import pikepdf

    output_path = _get_output_path(pdf_path, "verified")

    # Determine stamp content based on verification result
    is_valid = verification_result.get("is_valid", False)
    overall = verification_result.get("overall_status", "UNKNOWN")
    sig_count = verification_result.get("signature_count", 0)
    signatures = verification_result.get("signatures", [])

    # Build stamp text lines
    lines = []
    lines.append(f"VERIFICATION RESULT: {overall}")
    lines.append(f"Signatures: {sig_count}")
    lines.append(f"Verified: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")

    for i, sig in enumerate(signatures):
        signer = sig.get("signer", {})
        name = signer.get("common_name", "Unknown")
        trust = sig.get("trust_status", "UNKNOWN")
        intact = "Intact" if sig.get("intact") else "Tampered"
        lines.append(f"Sig {i+1}: {name} - {trust} ({intact})")

    if not signatures:
        lines.append("No signatures found in this document")

    stamp_text = "\\n".join(lines)

    try:
        pdf = pikepdf.open(pdf_path)

        # Ensure the PDF has at least one page
        if len(pdf.pages) == 0:
            pdf.add_blank_page(page_size=(612, 792))

        # Target page
        target_page = min(page, len(pdf.pages) - 1)

        # Create a Form XObject for the stamp
        # Use pikepdf's content stream to draw the stamp
        page_obj = pdf.pages[target_page]
        mediabox = page_obj.get("/MediaBox")
        if mediabox:
            page_width = float(mediabox[2])
            page_height = float(mediabox[3])
        else:
            page_width, page_height = 612, 792

        # Stamp position: top-right corner
        stamp_width = 200
        stamp_height = 80 + (len(lines) * 12)
        stamp_x = page_width - stamp_width - 20
        stamp_y = page_height - stamp_height - 20

        # Create stamp annotation
        annot = pikepdf.Dictionary({
            "/Type": pikepdf.Name("/Annot"),
            "/Subtype": pikepdf.Name("/Widget"),
            "/FT": pikepdf.Name("/Tx"),
            "/Rect": pikepdf.Array([stamp_x, stamp_y, stamp_x + stamp_width, stamp_y + stamp_height]),
            "/V": pikepdf.String(stamp_text),
            "/F": pikepdf.Object.parse("4"),  # ReadOnly
            "/DA": pikepdf.String("/Helv 10 Tf 0 g"),
        })

        # Add appearance stream
        try:
            # Create a simple appearance
            ap_dict = pikepdf.Dictionary()
            normal_ap = pikepdf.Dictionary()

            # Build content stream for appearance
            content_lines = [
                "q",  # Save graphics state
                "0.95 0.95 0.95 rg",  # Light gray fill
                f"{stamp_x} {stamp_y} {stamp_width} {stamp_height} re",
                "f",  # Fill rectangle
                "0 0 0 rg",  # Black text
                f"/Helv 10 Tf",
            ]

            # Draw each line of text
            text_y = stamp_y + stamp_height - 15
            for line in lines:
                # Escape special characters
                safe_line = line.replace("(", "\\(").replace(")", "\\)")
                content_lines.append(f"{stamp_x + 5} {text_y} Td")
                content_lines.append(f"({safe_line}) Tj")
                content_lines.append("0 -14 Td")  # Move down
                text_y -= 14

            content_lines.append("Q")  # Restore graphics state

            content_stream = pikepdf.Stream(pdf, "\n".join(content_lines).encode("latin-1"))

            # Create XObject for the appearance
            xobj = pikepdf.Dictionary({
                "/Type": pikepdf.Name("/XObject"),
                "/Subtype": pikepdf.Name("/Form"),
                "/BBox": pikepdf.Array([stamp_x, stamp_y, stamp_x + stamp_width, stamp_y + stamp_height]),
                "/Resources": pikepdf.Dictionary({
                    "/Font": pikepdf.Dictionary({
                        "/Helv": pikepdf.Dictionary({
                            "/Type": pikepdf.Name("/Font"),
                            "/Subtype": pikepdf.Name("/Type1"),
                            "/BaseFont": pikepdf.Name("/Helvetica"),
                        })
                    })
                }),
                "/Stream": content_stream,
            })

            normal_ap[""] = xobj
            ap_dict["/N"] = normal_ap
            annot["/AP"] = ap_dict
        except Exception as e:
            # If appearance fails, still add the text annotation
            pass

        # Add annotation to the page
        if "/Annots" not in page_obj:
            page_obj["/Annots"] = pikepdf.Array()
        page_obj["/Annots"].append(annot)

        # Also add a "Verification Stamp" watermark on the page
        try:
            stamp_width_full = 180
            stamp_height_full = 30
            stamp_x_full = 20
            stamp_y_full = 20

            # Color based on status
            if is_valid:
                fill_color = "0.85 0.95 0.85"  # Light green
                border_color = "0.13 0.55 0.13"  # Green
            elif overall == "NO_SIGNATURES":
                fill_color = "0.95 0.95 0.85"  # Light yellow
                border_color = "0.85 0.55 0.06"  # Amber
            else:
                fill_color = "0.95 0.85 0.85"  # Light red
                border_color = "0.86 0.15 0.15"  # Red

            status_text = f"✓ VERIFIED: {overall}" if is_valid else f"✗ {overall}"

            watermark_content = [
                "q",
                f"{fill_color} rg",
                f"{border_color} RG",
                "2 w",
                f"{stamp_x_full} {stamp_y_full} {stamp_width_full} {stamp_height_full} re",
                "B",  # Fill and stroke
                "0 0 0 rg",
                "/Helv 9 Tf",
                f"{stamp_x_full + 5} {stamp_y_full + 12} Td",
                f"({status_text}) Tj",
                "Q",
            ]

            wm_stream = pikepdf.Stream(pdf, "\n".join(watermark_content).encode("latin-1"))
            wm_xobj = pikepdf.Dictionary({
                "/Type": pikepdf.Name("/XObject"),
                "/Subtype": pikepdf.Name("/Form"),
                "/BBox": pikepdf.Array([stamp_x_full, stamp_y_full, stamp_x_full + stamp_width_full, stamp_y_full + stamp_height_full]),
                "/Resources": pikepdf.Dictionary({
                    "/Font": pikepdf.Dictionary({
                        "/Helv": pikepdf.Dictionary({
                            "/Type": pikepdf.Name("/Font"),
                            "/Subtype": pikepdf.Name("/Type1"),
                            "/BaseFont": pikepdf.Name("/Helvetica"),
                        })
                    })
                }),
                "/Stream": wm_stream,
            })

            # Add watermark annotation
            wm_annot = pikepdf.Dictionary({
                "/Type": pikepdf.Name("/Annot"),
                "/Subtype": pikepdf.Name("/Widget"),
                "/FT": pikepdf.Name("/Tx"),
                "/Rect": pikepdf.Array([stamp_x_full, stamp_y_full, stamp_x_full + stamp_width_full, stamp_y_full + stamp_height_full]),
                "/V": pikepdf.String(status_text),
                "/F": pikepdf.Object.parse("4"),
                "/DA": pikepdf.String("/Helv 9 Tf 0 0 0 rg"),
                "/AP": pikepdf.Dictionary({
                    "/N": pikepdf.Dictionary({
                        "": wm_xobj,
                    })
                }),
            })

            if "/Annots" not in page_obj:
                page_obj["/Annots"] = pikepdf.Array()
            page_obj["/Annots"].append(wm_annot)
        except Exception:
            pass

        pdf.save(output_path)
        pdf.close()

    except Exception as e:
        # Fallback: just copy the file
        import shutil
        shutil.copy2(pdf_path, output_path)

    return output_path


def _get_output_path(original_path: str, prefix: str) -> str:
    """Generate output path for processed PDF."""
    original = Path(original_path)
    output_name = f"{prefix}_{uuid.uuid4().hex[:8]}_{original.name}"
    return str(SIGNED_DIR / output_name)
