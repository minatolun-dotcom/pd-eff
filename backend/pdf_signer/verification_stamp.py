"""Verification stamp service — draws verification stamps directly on page content.

Unlike widget annotation appearances (which only render in Acrobat),
drawing stamps on the page content stream ensures they show in ALL
PDF viewers including Chrome, Firefox, and our own preview.
"""
import uuid
from pathlib import Path
import pikepdf
from .config import SIGNED_DIR


def stamp_verification_result(pdf_path: str, verification_result: dict, page: int = 0) -> str:
    """Draw Acrobat-style verification stamps directly on page content."""

    output_path = _get_output_path(pdf_path, "verified")
    signatures = verification_result.get("signatures", [])
    is_valid = verification_result.get("is_valid", False)

    try:
        pdf = pikepdf.open(pdf_path)
        if len(pdf.pages) == 0:
            pdf.add_blank_page(page_size=(612, 792))

        target_page = min(page, len(pdf.pages) - 1)
        page_obj = pdf.pages[target_page]
        mb = page_obj.get("/MediaBox")
        page_width = float(mb[2]) if mb else 612
        page_height = float(mb[3]) if mb else 792

        # ── Ensure page has Resources/XObject ───────────────────────
        _ensure_page_resources(page_obj)

        stamp_index = 0

        # ── Find widget annotation positions ────────────────────────
        widget_rects = _get_widget_rects(page_obj)

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
            sub_filter = details.get("sub_filter", "")

            if intact and trust == "VALID":
                status = "valid"
                status_text = "Signature Verified"
            elif intact:
                status = "untrusted"
                status_text = "Signature Verified (untrusted)"
            else:
                status = "invalid"
                status_text = "Signature Not Verified"

            # Find the widget rect for this signature
            widget_rect = None
            if position:
                widget_rect = _find_widget_for_sig(position, widget_rects)

            # Determine stamp placement
            if widget_rect:
                # Place stamp at the widget annotation's position
                sx, sy, sw, sh = widget_rect
                # Expand to show full stamp info
                if sw < 180:
                    sw = 180
                if sh < 60:
                    sh = 80
                # Adjust so text fits
                sx = min(sx, page_width - sw - 5)
                sy = max(sy, 5)
            elif position:
                # Place near the signature field
                px = float(position["x1"])
                py = float(position["y1"])
                sw, sh = 220, 90
                # Place below or beside the signature
                sx = px
                sy = py - sh - 5
                if sy < 5:
                    sy = float(position["y2"]) + 5
                if sx + sw > page_width - 5:
                    sx = page_width - sw - 5
            else:
                sw, sh = 220, 90
                sx = page_width - sw - 15
                sy = 15

            # ── White-out any existing stamp in this area ────────────
            white_out_cmd = (
                f"q 1 1 1 rg 1 1 1 RG 1 w "
                f"{sx-3} {sy-3} {sw+6} {sh+6} re B Q"
            )

            # ── Draw verification stamp ─────────────────────────────
            content = _build_stamp_content(
                sw, sh,
                signer_name, signer_org, signer_title,
                status, status_text,
                reason, location, signing_time, sub_filter,
            )

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
                "/BBox": pikepdf.Array([0, 0, sw, sh]),
                "/Resources": resources,
                "/Stream": stream,
            })

            xobj_name = f"/Stamp{stamp_index}"
            page_obj["/Resources"]["/XObject"][xobj_name] = xobj
            stamp_index += 1

            draw_op = f"q 1 0 0 1 {sx} {sy} cm {xobj_name} Do Q"
            _append_to_contents(page_obj, pdf, white_out_cmd + "\n" + draw_op)

        # ── Add verification badge at bottom-left ───────────────────
        _add_verification_badge(pdf, page_obj, page_width, page_height, is_valid, verification_result, stamp_index)

        pdf.save(output_path)
        pdf.close()
    except Exception as e:
        import shutil, logging
        logging.getLogger(__name__).error(f"Stamp failed: {e}", exc_info=True)
        shutil.copy2(pdf_path, output_path)

    return output_path


def _ensure_page_resources(page_obj):
    """Ensure the page has /Resources /XObject dictionary."""
    if "/Resources" not in page_obj:
        page_obj["/Resources"] = pikepdf.Dictionary()
    if "/XObject" not in page_obj["/Resources"]:
        page_obj["/Resources"]["/XObject"] = pikepdf.Dictionary()


def _get_widget_rects(page_obj):
    """Get all widget annotation rectangles from the page."""
    rects = []
    annots = page_obj.get("/Annots")
    if not annots:
        return rects
    for annot in annots:
        if not isinstance(annot, pikepdf.Dictionary):
            continue
        rect = annot.get("/Rect")
        if rect:
            rects.append((
                float(rect[0]), float(rect[1]),
                float(rect[2]), float(rect[3]),
            ))
    return rects


def _find_widget_for_sig(position, widget_rects):
    """Find the widget rect that best matches a signature position."""
    if not position or not widget_rects:
        return None
    px = (float(position["x1"]) + float(position["x2"])) / 2
    py = (float(position["y1"]) + float(position["y2"])) / 2
    best = None
    best_dist = float("inf")
    for rect in widget_rects:
        rcx = (rect[0] + rect[2]) / 2
        rcy = (rect[1] + rect[3]) / 2
        dist = ((px - rcx) ** 2 + (py - rcy) ** 2) ** 0.5
        if dist < best_dist:
            best_dist = dist
            best = rect
    if best and best_dist < 200:
        return best
    return None


def _build_stamp_content(
    w, h,
    signer_name, signer_org, signer_title,
    status, status_text,
    reason, location, signing_time, sub_filter,
):
    """Build PDF content stream for a verification stamp."""
    # Colors
    if status == "valid":
        bg = "0.93 0.99 0.93"
        border_c = "0.18 0.68 0.18"
        status_c = "0.10 0.52 0.10"
        check_c = "0.10 0.52 0.10"
    elif status == "untrusted":
        bg = "1.0 0.97 0.88"
        border_c = "0.85 0.65 0.13"
        status_c = "0.72 0.52 0.05"
        check_c = "0.85 0.65 0.13"
    else:
        bg = "1.0 0.93 0.93"
        border_c = "0.86 0.15 0.15"
        status_c = "0.72 0.10 0.10"
        check_c = "0.86 0.15 0.15"

    def safe(s):
        return str(s).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")[:45] if s else ""

    lines = [
        "q",
        # Background
        f"{bg} rg",
        f"{border_c} RG",
        "1.5 w",
        f"0 0 {w} {h} re B",
        # "Signed by :" header
        "0.45 0.45 0.45 rg",
        "/F1 9 Tf",
        f"10 {h - 16} Td (Signed by :) Tj",
        # Signer name (bold)
        "0 0 0 rg",
        "/F1B 11 Tf",
        f"0 -15 Td ({safe(signer_name[:35])}) Tj",
    ]

    # Organization / Title
    org_line = ""
    if signer_org:
        org_line = signer_org[:35]
    if signer_title:
        org_line += f" , {signer_title}" if org_line else signer_title[:35]
    if org_line:
        lines.extend([
            "/F1 8 Tf",
            f"0 -12 Td ({safe(org_line[:40])}) Tj",
        ])

    # Status line
    lines.extend([
        "0 -8 Td",
        f"{status_c} rg",
        "/F1B 10 Tf",
        f"({safe(status_text)}) Tj",
    ])

    # Checkmark / question mark / X on right side
    check_x = w - 30
    check_y = h - 30
    lines.extend([f"{check_c} RG", f"{check_c} rg"])

    if status == "valid":
        lines.extend([
            "2.5 w",
            f"{check_x} {check_y} m {check_x + 5} {check_y - 7} l {check_x + 15} {check_y + 5} l S",
            f"{check_x + 7.5} {check_y - 1} 10 0 360 arc S",
        ])
    elif status == "untrusted":
        lines.extend([
            "/F1B 20 Tf",
            f"{check_x - 2} {check_y - 6} Td (?) Tj",
        ])
    else:
        lines.extend([
            "2.5 w",
            f"{check_x} {check_y + 5} m {check_x + 14} {check_y - 8} l S",
            f"{check_x + 14} {check_y + 5} m {check_x} {check_y - 8} l S",
        ])

    # Detail lines
    lines.extend(["0 0 0 rg", "/F1 7 Tf"])

    if signing_time and signing_time != "Unknown":
        time_str = str(signing_time)[:35]
        if "D:" in time_str:
            try:
                parts = time_str.replace("D:", "").split("+")[0]
                time_str = f"{parts[:4]}.{parts[4:6]}.{parts[6:8]} {parts[8:10]}:{parts[10:12]}:{parts[12:14]}"
            except Exception:
                pass
        lines.append(f"0 -10 Td (Date: {safe(time_str)}) Tj")

    if reason:
        lines.append(f"0 -10 Td (Reason: {safe(reason[:30])}) Tj")
    if location:
        lines.append(f"0 -10 Td (Location: {safe(location[:30])}) Tj")

    lines.append("Q")
    return "\n".join(lines)


def _add_verification_badge(pdf, page_obj, page_width, page_height, is_valid, verification_result, stamp_index):
    """Add a verification badge at the bottom-left of the page."""

    badge_w = 180
    badge_h = 26
    badge_x = 15
    badge_y = 15

    if is_valid:
        bg = "0.85 0.95 0.85"
        border = "0.18 0.68 0.18"
        text = "0.10 0.52 0.10"
        label = "Signature Verified"
    else:
        overall = verification_result.get("overall_status", "")
        if overall == "NO_SIGNATURES":
            bg = "0.95 0.95 0.85"
            border = "0.85 0.65 0.13"
            text = "0.72 0.52 0.05"
            label = "No Signatures"
        else:
            bg = "0.95 0.85 0.85"
            border = "0.86 0.15 0.15"
            text = "0.72 0.10 0.10"
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
/F1B 9 Tf
8 8 Td
({safe_label}) Tj
/F1 7 Tf
0 -1 Td
({sig_count} signature(s) verified) Tj
Q"""

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
        "/BBox": pikepdf.Array([0, 0, badge_w, badge_h]),
        "/Resources": resources,
        "/Stream": stream,
    })

    xobj_name = f"/VerificationBadge"
    page_obj["/Resources"]["/XObject"][xobj_name] = xobj

    draw_op = f"q 1 0 0 1 {badge_x} {badge_y} cm {xobj_name} Do Q"
    _append_to_contents(page_obj, pdf, draw_op)


def _append_to_contents(page_obj, pdf, draw_op):
    """Append drawing operations to the page content stream."""

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
