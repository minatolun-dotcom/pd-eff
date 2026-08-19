"""Verification stamp service — Acrobat-style signature appearance.

Creates a visual verification stamp embedded directly into the PDF page,
similar to how Adobe Acrobat displays verified signatures:

┌─────────────────────────────────┐
│  Signed by :                    │
│  KAIGOULAL KIPGEN               │
│  SDO , SDO SAIKUL               │
│                                 │
│  Signature valid        ✓       │
│                                 │
│  Digitally signed by KAIGOULAL  │
│  Date: 2024.08.10 15:23:12 IST  │
│  Reason: GCM                    │
│  Location: Manipur              │
└─────────────────────────────────┘
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
    Embed Acrobat-style verification stamp into the PDF.

    For each signature, draws a visual stamp at the signature's location
    showing signer info, validity status, and a green checkmark or
    yellow question mark.
    """
    import pikepdf

    output_path = _get_output_path(pdf_path, "verified")

    signatures = verification_result.get("signatures", [])
    page_dims = verification_result.get("page_dimensions")
    is_valid = verification_result.get("is_valid", False)

    try:
        pdf = pikepdf.open(pdf_path)

        if len(pdf.pages) == 0:
            pdf.add_blank_page(page_size=(612, 792))

        target_page = min(page, len(pdf.pages) - 1)
        page_obj = pdf.pages[target_page]

        mediabox = page_obj.get("/MediaBox")
        if mediabox:
            page_width = float(mediabox[2])
            page_height = float(mediabox[3])
        else:
            page_width, page_height = 612, 792

        # ── Draw a stamp for each signature ─────────────────────────────
        for i, sig in enumerate(signatures):
            signer = sig.get("signer", {})
            details = sig.get("details", {})
            position = details.get("position")
            intact = sig.get("intact", False)
            trust = sig.get("trust_status", "")

            signer_name = signer.get("common_name", "Unknown Signer")
            signer_org = signer.get("organization", "")
            signer_title = signer.get("title", "")
            reason = details.get("reason", "")
            location = details.get("location", "")
            signing_time = sig.get("timestamps", {}).get("signing_time", "")

            # Determine status
            if intact and trust == "VALID":
                status = "valid"
                status_text = "Signature valid"
            elif intact:
                status = "untrusted"
                status_text = "Signature valid (untrusted)"
            else:
                status = "invalid"
                status_text = "Signature not verified"

            # Position: use signature's Rect if available, otherwise default
            if position:
                # Place stamp below the signature area
                stamp_x = float(position["x1"])
                stamp_y = float(position["y1"]) - 120  # Below signature
                stamp_w = float(position["x2"]) - float(position["x1"])
                stamp_h = 110
                # Ensure stamp stays on page
                if stamp_y < 10:
                    stamp_y = float(position["y2"]) + 10
                if stamp_x + stamp_w > page_width - 10:
                    stamp_x = page_width - stamp_w - 10
            else:
                # Default position: bottom-right
                stamp_w = 220
                stamp_h = 110
                stamp_x = page_width - stamp_w - 20
                stamp_y = 20

            # Build the content stream for this stamp
            content = _build_stamp_content(
                stamp_x, stamp_y, stamp_w, stamp_h,
                signer_name, signer_org, signer_title,
                status, status_text,
                reason, location, signing_time,
                page_width, page_height,
            )

            # Create XObject for the stamp
            resources = pikepdf.Dictionary({
                "/Font": pikepdf.Dictionary({
                    "/F1": pikepdf.Dictionary({
                        "/Type": pikepdf.Name("/Font"),
                        "/Subtype": pikepdf.Name("/Type1"),
                        "/BaseFont": pikepdf.Name("/Helvetica"),
                    }),
                    "/F1B": pikepdf.Dictionary({
                        "/Type": pikepdf.Name("/Font"),
                        "/Subtype": pikepdf.Name("/Type1"),
                        "/BaseFont": pikepdf.Name("/Helvetica-Bold"),
                    }),
                })
            })

            stream = pikepdf.Stream(pdf, content.encode("latin-1"))
            xobj = pikepdf.Dictionary({
                "/Type": pikepdf.Name("/XObject"),
                "/Subtype": pikepdf.Name("/Form"),
                "/BBox": pikepdf.Array([0, 0, stamp_w, stamp_h]),
                "/Resources": resources,
                "/Stream": stream,
            })

            # Register the XObject
            xobj_name = f"/Stamp{i}"
            if "/Resources" not in page_obj:
                page_obj["/Resources"] = pikepdf.Dictionary()
            if "/XObject" not in page_obj["/Resources"]:
                page_obj["/Resources"]["/XObject"] = pikepdf.Dictionary()
            page_obj["/Resources"]["/XObject"][xobj_name] = xobj

            # Draw the stamp using a content stream operator
            # q ... Q wrapper for this stamp
            draw_op = f"q 1 0 0 1 {stamp_x} {stamp_y} cm {xobj_name} Do Q"

            # Append to page content stream
            if "/Contents" in page_obj:
                existing = page_obj["/Contents"]
                if isinstance(existing, pikepdf.Stream):
                    old_data = existing.read_bytes()
                    page_obj["/Contents"] = pikepdf.Stream(
                        pdf, old_data + b"\n" + draw_op.encode("latin-1")
                    )
                elif isinstance(existing, pikepdf.Array):
                    # Concatenate all streams
                    all_data = b""
                    for item in existing:
                        if isinstance(item, pikepdf.Stream):
                            all_data += item.read_bytes() + b"\n"
                    all_data += draw_op.encode("latin-1")
                    page_obj["/Contents"] = pikepdf.Stream(pdf, all_data)
            else:
                page_obj["/Contents"] = pikepdf.Stream(pdf, draw_op.encode("latin-1"))

        # ── Add a small verification badge at bottom-left ───────────────
        _add_verification_badge(pdf, page_obj, page_width, page_height, is_valid, verification_result)

        pdf.save(output_path)
        pdf.close()

    except Exception as e:
        import shutil
        import logging
        logging.getLogger(__name__).error(f"Stamp failed: {e}", exc_info=True)
        shutil.copy2(pdf_path, output_path)

    return output_path


def _build_stamp_content(
    x: float, y: float, w: float, h: float,
    signer_name: str, signer_org: str, signer_title: str,
    status: str, status_text: str,
    reason: str, location: str, signing_time: str,
    page_width: float, page_height: float,
) -> str:
    """Build PDF content stream operators for the verification stamp."""

    # Colors
    if status == "valid":
        bg_r, bg_g, bg_b = 0.95, 1.0, 0.95      # Light green bg
        border_r, border_g, border_b = 0.2, 0.7, 0.2  # Green border
        status_r, status_g, status_b = 0.13, 0.55, 0.13  # Dark green text
        check_color = "0.13 0.55 0.13"  # Green
    elif status == "untrusted":
        bg_r, bg_g, bg_b = 1.0, 0.98, 0.90      # Light yellow bg
        border_r, border_g, border_b = 0.85, 0.65, 0.13  # Amber border
        status_r, status_g, status_b = 0.75, 0.55, 0.06  # Dark amber text
        check_color = "0.85 0.65 0.13"  # Amber
    else:
        bg_r, bg_g, bg_b = 1.0, 0.95, 0.95      # Light red bg
        border_r, border_g, border_b = 0.86, 0.15, 0.15  # Red border
        status_r, status_g, status_b = 0.75, 0.10, 0.10  # Dark red text
        check_color = "0.86 0.15 0.15"  # Red

    lines = []
    lines.append("q")  # Save graphics state

    # Background rectangle with rounded corners (simulated)
    lines.append(f"{bg_r} {bg_g} {bg_b} rg")  # Fill color
    lines.append(f"{border_r} {border_g} {border_b} RG")  # Stroke color
    lines.append("1.5 w")  # Line width
    lines.append(f"0 0 {w} {h} re")
    lines.append("B")  # Fill and stroke

    # ── "Signed by :" header ────────────────────────────────────
    text_y = h - 18
    lines.append("0.4 0.4 0.4 rg")  # Gray
    lines.append("/F1 9 Tf")
    lines.append(f"12 {text_y} Td")
    lines.append("(Signed by :) Tj")

    # ── Signer name (bold, large) ───────────────────────────────
    text_y -= 18
    lines.append("0 0 0 rg")  # Black
    lines.append("/F1B 13 Tf")
    lines.append(f"-12 -18 Td")  # Reset and move
    lines.append(f"12 {text_y} Td")

    # Truncate long names
    display_name = signer_name[:35] if signer_name else "Unknown"
    safe_name = display_name.replace("(", "\\(").replace(")", "\\)")
    lines.append(f"({safe_name}) Tj")

    # ── Organization / Title ─────────────────────────────────────
    if signer_org or signer_title:
        text_y -= 15
        lines.append("/F1 10 Tf")
        lines.append(f"0 -15 Td")
        org_line = f"{signer_org}" if signer_org else ""
        if signer_title:
            org_line += f" , {signer_title}" if org_line else signer_title
        org_line = org_line[:40]
        safe_org = org_line.replace("(", "\\(").replace(")", "\\)")
        lines.append(f"({safe_org}) Tj")

    # ── Status line ─────────────────────────────────────────────
    text_y -= 20
    lines.append(f"0 -5 Td")
    lines.append(f"{status_r} {status_g} {status_b} rg")
    lines.append("/F1B 10 Tf")
    safe_status = status_text.replace("(", "\\(").replace(")", "\\)")
    lines.append(f"({safe_status}) Tj")

    # ── Green checkmark / amber question mark / red X ────────────
    # Draw on the right side
    check_x = w - 30
    check_y = h - 55
    lines.append(f"{check_color} rg")

    if status == "valid":
        # Draw a checkmark (✓)
        lines.append(f"3 w")
        lines.append(f"{check_color} RG")
        lines.append(f"{check_x} {check_y} m")
        lines.append(f"{check_x + 6} {check_y - 8} l")
        lines.append(f"{check_x + 18} {check_y + 6} l")
        lines.append("S")
        # Circle around it
        lines.append(f"{check_x + 9} {check_y - 1} 12 0 360 arc")
        lines.append("S")
    elif status == "untrusted":
        # Draw a question mark (?)
        lines.append("/F1B 20 Tf")
        lines.append(f"{check_x - 2} {check_y - 6} Td")
        lines.append("(?) Tj")
    else:
        # Draw an X
        lines.append(f"3 w")
        lines.append(f"{check_color} RG")
        lines.append(f"{check_x} {check_y + 6} m")
        lines.append(f"{check_x + 16} {check_y - 10} l")
        lines.append("S")
        lines.append(f"{check_x + 16} {check_y + 6} m")
        lines.append(f"{check_x} {check_y - 10} l")
        lines.append("S")

    # ── Details (small text) ────────────────────────────────────
    text_y -= 18
    lines.append("0.4 0.4 0.4 rg")  # Gray
    lines.append("/F1 7 Tf")

    if signing_time and signing_time != "Unknown":
        lines.append(f"0 -10 Td")
        safe_time = str(signing_time)[:40].replace("(", "\\(").replace(")", "\\)")
        lines.append(f"(Date: {safe_time}) Tj")

    if reason:
        lines.append(f"0 -10 Td")
        safe_reason = reason[:30].replace("(", "\\(").replace(")", "\\)")
        lines.append(f"(Reason: {safe_reason}) Tj")

    if location:
        lines.append(f"0 -10 Td")
        safe_loc = location[:30].replace("(", "\\(").replace(")", "\\)")
        lines.append(f"(Location: {safe_loc}) Tj")

    lines.append("Q")  # Restore graphics state

    return "\n".join(lines)


def _add_verification_badge(pdf, page_obj, page_width, page_height, is_valid, verification_result):
    """Add a small verification badge at the bottom-left of the page."""
    import pikepdf

    badge_w = 160
    badge_h = 22
    badge_x = 15
    badge_y = 15

    if is_valid:
        bg = "0.85 0.95 0.85"
        border = "0.2 0.7 0.2"
        text = "0.13 0.55 0.13"
        label = "Signature Verified"
    else:
        overall = verification_result.get("overall_status", "")
        if overall == "NO_SIGNATURES":
            bg = "0.95 0.95 0.85"
            border = "0.85 0.65 0.13"
            text = "0.75 0.55 0.06"
            label = "No Signatures"
        else:
            bg = "0.95 0.85 0.85"
            border = "0.86 0.15 0.15"
            text = "0.75 0.10 0.10"
            label = "Verification Failed"

    safe_label = label.replace("(", "\\(").replace(")", "\\)")
    sig_count = verification_result.get("signature_count", 0)

    content = f"""q
{bg} rg
{border} RG
1 w
0 0 {badge_w} {badge_h} re
B
{text} rg
/F1 8 Tf
8 7 Td
({safe_label}) Tj
/F1 7 Tf
0 -1 Td
({sig_count} signature(s)) Tj
Q"""

    resources = pikepdf.Dictionary({
        "/Font": pikepdf.Dictionary({
            "/F1": pikepdf.Dictionary({
                "/Type": pikepdf.Name("/Font"),
                "/Subtype": pikepdf.Name("/Type1"),
                "/BaseFont": pikepdf.Name("/Helvetica"),
            }),
        })
    })

    stream = pikepdf.Stream(pdf, content.encode("latin-1"))
    xobj = pikepdf.Dictionary({
        "/Type": pikepdf.Name("/XObject"),
        "/Subtype": pikepdf.Name("/Form"),
        "/BBox": pikepdf.Array([0, 0, badge_w, badge_h]),
        "/Resources": resources,
        "/Stream": stream,
    })

    xobj_name = "/VerificationBadge"
    if "/Resources" not in page_obj:
        page_obj["/Resources"] = pikepdf.Dictionary()
    if "/XObject" not in page_obj["/Resources"]:
        page_obj["/Resources"]["/XObject"] = pikepdf.Dictionary()
    page_obj["/Resources"]["/XObject"][xobj_name] = xobj

    draw_op = f"q 1 0 0 1 {badge_x} {badge_y} cm {xobj_name} Do Q"

    if "/Contents" in page_obj:
        existing = page_obj["/Contents"]
        if isinstance(existing, pikepdf.Stream):
            old_data = existing.read_bytes()
            page_obj["/Contents"] = pikepdf.Stream(
                pdf, old_data + b"\n" + draw_op.encode("latin-1")
            )
        elif isinstance(existing, pikepdf.Array):
            all_data = b""
            for item in existing:
                if isinstance(item, pikepdf.Stream):
                    all_data += item.read_bytes() + b"\n"
            all_data += draw_op.encode("latin-1")
            page_obj["/Contents"] = pikepdf.Stream(pdf, all_data)
    else:
        page_obj["/Contents"] = pikepdf.Stream(pdf, draw_op.encode("latin-1"))


def _get_output_path(original_path: str, prefix: str) -> str:
    """Generate output path for processed PDF."""
    original = Path(original_path)
    output_name = f"{prefix}_{uuid.uuid4().hex[:8]}_{original.name}"
    return str(SIGNED_DIR / output_name)
