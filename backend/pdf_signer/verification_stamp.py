"""Verification stamp service — Acrobat-style signature appearance.

Replaces the "Signature Not Verified" appearance of signature widget
annotations with a green "Signature Verified" appearance, similar to
how Adobe Acrobat displays verified signatures.

Also adds a small verification badge at the bottom-left of each page.
"""
import uuid
from pathlib import Path
from .config import SIGNED_DIR


def stamp_verification_result(pdf_path: str, verification_result: dict, page: int = 0) -> str:
    """Replace signature widget appearances with verified stamps."""
    import pikepdf

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

        # ── Find and update signature widget annotations ────────────
        _stamp_signature_widgets(pdf, page_obj, signatures)

        # ── Also overlay any text/image stamps in page content ──────
        _overlay_page_stamps(pdf, page_obj, signatures, page_width, page_height)

        # ── Add verification badge at bottom-left ───────────────────
        _add_verification_badge(pdf, page_obj, page_width, page_height, is_valid, verification_result)

        pdf.save(output_path)
        pdf.close()
    except Exception as e:
        import shutil, logging
        logging.getLogger(__name__).error(f"Stamp failed: {e}", exc_info=True)
        shutil.copy2(pdf_path, output_path)

    return output_path


def _stamp_signature_widgets(pdf, page_obj, signatures):
    """Replace the appearance of signature widget annotations with verified stamps."""
    import pikepdf

    annots = page_obj.get("/Annots")
    if not annots:
        return

    for annot in annots:
        if not isinstance(annot, pikepdf.Dictionary):
            continue
        # Only process signature fields
        if annot.get("/FT") != pikepdf.Name("/Sig") and annot.get("/Subtype") != pikepdf.Name("/Widget"):
            # Check if it's a widget that contains a signature
            pass

        if "/AP" not in annot:
            continue

        ap = annot["/AP"]
        if "/N" not in ap:
            continue

        rect = annot.get("/Rect")
        if not rect:
            continue

        rect_x1, rect_y1, rect_x2, rect_y2 = (
            float(rect[0]), float(rect[1]),
            float(rect[2]), float(rect[3]),
        )
        w = rect_x2 - rect_x1
        h = rect_y2 - rect_y1

        if w < 10 or h < 10:
            continue

        # Find the matching signature info
        sig_info = _find_sig_for_rect(rect_x1, rect_y1, rect_x2, rect_y2, signatures)

        signer_name = "Unknown Signer"
        signer_org = ""
        signer_title = ""
        status = "valid"
        status_text = "Signature Verified"
        reason = ""
        location = ""
        signing_time = ""
        sub_filter = ""

        if sig_info:
            signer = sig_info.get("signer", {})
            details = sig_info.get("details", {})
            signer_name = signer.get("common_name", "Unknown Signer")
            signer_org = signer.get("organization", "")
            signer_title = signer.get("title", "")
            reason = details.get("reason", "")
            location = details.get("location", "")
            signing_time = sig_info.get("timestamps", {}).get("signing_time", "")
            sub_filter = details.get("sub_filter", "")
            intact = sig_info.get("intact", False)
            trust = sig_info.get("trust_status", "")

            if intact and trust == "VALID":
                status = "valid"
                status_text = "Signature Verified"
            elif intact:
                status = "untrusted"
                status_text = "Signature Verified (untrusted)"
            else:
                status = "invalid"
                status_text = "Signature Not Verified"

        # Create new appearance stream
        new_appearance = _create_verified_appearance(
            pdf, w, h,
            signer_name, signer_org, signer_title,
            status, status_text,
            reason, location, signing_time, sub_filter,
        )

        # Replace the appearance
        ap["/N"] = new_appearance


def _create_verified_appearance(
    pdf, w, h,
    signer_name, signer_org, signer_title,
    status, status_text,
    reason, location, signing_time, sub_filter,
):
    """Create a verified appearance Form XObject for a signature widget."""
    import pikepdf

    # Colors
    if status == "valid":
        bg = "0.93 0.99 0.93"
        border_color = "0.18 0.68 0.18"
        text_color = "0 0 0"
        status_color = "0.10 0.52 0.10"
        check_color = "0.10 0.52 0.10"
        status_symbol = "check"
    elif status == "untrusted":
        bg = "1.0 0.97 0.88"
        border_color = "0.85 0.65 0.13"
        text_color = "0 0 0"
        status_color = "0.72 0.52 0.05"
        check_color = "0.85 0.65 0.13"
        status_symbol = "question"
    else:
        bg = "1.0 0.93 0.93"
        border_color = "0.86 0.15 0.15"
        text_color = "0 0 0"
        status_color = "0.72 0.10 0.10"
        check_color = "0.86 0.15 0.15"
        status_symbol = "cross"

    def safe(s):
        return str(s).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")[:45] if s else ""

    # Layout: for small widgets (like the 180×30 default), show compact view
    # For larger widgets, show the full Acrobat-style view
    is_compact = (w < 250 or h < 60)

    lines = ["q"]

    if is_compact:
        # Compact view — green bg with checkmark, name, status on 2 lines
        lines.extend([
            f"{bg} rg",
            f"{border_color} RG",
            "1 w",
            f"0 0 {w} {h} re B",
        ])

        if status == "valid":
            # Green checkmark (left)
            cx, cy = 6, h / 2 + 1
            lines.extend([
                f"{check_color} RG",
                "2 w",
                f"{cx} {cy} m {cx+3} {cy-4} l {cx+11} {cy+4} l S",
                f"{cx+5.5} {cy-0.5} 8 0 360 arc S",
            ])
            # Line 1: "Signed by : NAME"
            lines.extend([
                "0.45 0.45 0.45 rg",
                "/F1 7 Tf",
                f"18 {h-10} Td (Signed by :) Tj",
                f"0 0 0 rg /F1B 8 Tf",
                f"0 -8 Td ({safe(signer_name[:28])}) Tj",
            ])
            # Line 2: status + date
            time_str = signing_time[:20] if signing_time and signing_time != "Unknown" else ""
            if time_str and "D:" in time_str:
                try:
                    parts = time_str.replace("D:", "").split("+")[0]
                    time_str = f"{parts[:4]}.{parts[4:6]}.{parts[6:8]}"
                except Exception:
                    pass
            status_line = f"{status_text}"
            if time_str:
                status_line += f"  |  {time_str}"
            lines.extend([
                f"{status_color} rg",
                "/F1B 7 Tf",
                f"0 -9 Td ({safe(status_line[:40])}) Tj",
            ])
        elif status == "untrusted":
            # Amber question mark
            lines.extend([
                f"{check_color} rg /F1B 10 Tf",
                f"4 {h/2+1} Td (?) Tj",
            ])
            lines.extend([
                f"{status_color} rg /F1B 7 Tf",
                f"16 -3 Td ({safe(signer_name[:28])}) Tj",
                f"0 -8 Td ({safe(status_text[:35])}) Tj",
            ])
        else:
            # Red X
            lines.extend([
                f"{check_color} RG 2 w",
                f"6 {h/2+3} m 14 {h/2-3} l S",
                f"14 {h/2+3} m 6 {h/2-3} l S",
            ])
            lines.extend([
                f"{status_color} rg /F1B 7 Tf",
                f"18 {h/2-2} Td ({safe(status_text[:30])}) Tj",
            ])
    else:
        # Full Acrobat-style view
        lines.extend([
            f"{bg} rg",
            f"{border_color} RG",
            "1.5 w",
            f"0 0 {w} {h} re B",
            # "Signed by :" header
            "0.45 0.45 0.45 rg",
            "/F1 9 Tf",
            f"8 {h-16} Td (Signed by :) Tj",
            # Signer name
            f"0 0 0 rg",
            "/F1B 12 Tf",
            f"0 -16 Td ({safe(signer_name[:35])}) Tj",
        ])

        # Organization
        org_line = ""
        if signer_org:
            org_line = signer_org[:35]
        if signer_title:
            org_line += f" , {signer_title}" if org_line else signer_title[:35]
        if org_line:
            lines.append(f"/F1 9 Tf")
            lines.append(f"0 -14 Td ({safe(org_line[:40])}) Tj")

        # Status
        lines.extend([
            "0 -8 Td",
            f"{status_color} rg",
            "/F1B 10 Tf",
            f"({safe(status_text)}) Tj",
        ])

        # Checkmark on right side
        check_x = w - 30
        check_y = h - 40
        lines.extend([
            f"{check_color} RG",
            f"{check_color} rg",
        ])

        if status_symbol == "check":
            lines.extend([
                "3 w",
                f"{check_x} {check_y} m {check_x+5} {check_y-7} l {check_x+15} {check_y+5} l S",
                f"{check_x+7.5} {check_y-1} 10 0 360 arc S",
            ])
        elif status_symbol == "question":
            lines.extend([
                "/F1B 20 Tf",
                f"{check_x-2} {check_y-6} Td (?) Tj",
            ])
        else:
            lines.extend([
                "3 w",
                f"{check_x} {check_y+5} m {check_x+14} {check_y-8} l S",
                f"{check_x+14} {check_y+5} m {check_x} {check_y-8} l S",
            ])

        # Details
        lines.append(f"0 0 0 rg")
        lines.append("/F1 7 Tf")

        if signing_time and signing_time != "Unknown":
            time_str = str(signing_time)[:35]
            if "D:" in time_str:
                # Format: D:20210927212156+05'30' → 2021.09.27 21:21:56 IST
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
        if sub_filter:
            algo = sub_filter.replace("/adbe.", "").replace("pkcs7.", "PKCS#7 ")
            lines.append(f"0 -10 Td (Method: {safe(algo)}) Tj")

    lines.append("Q")
    content = "\n".join(lines)

    # Create font resources
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
    form = pikepdf.Dictionary({
        "/Type": pikepdf.Name("/XObject"),
        "/Subtype": pikepdf.Name("/Form"),
        "/BBox": pikepdf.Array([0, 0, w, h]),
        "/Resources": resources,
        "/Stream": stream,
    })

    return form


def _find_sig_for_rect(rx1, ry1, rx2, ry2, signatures):
    """Find signature info matching a widget annotation rectangle."""
    for sig in signatures:
        pos = sig.get("details", {}).get("position")
        if not pos:
            continue
        px1 = float(pos.get("x1", 0))
        py1 = float(pos.get("y1", 0))
        px2 = float(pos.get("x2", 0))
        py2 = float(pos.get("y2", 0))

        # Check overlap
        overlap_x = max(0, min(rx2, px2) - max(rx1, px1))
        overlap_y = max(0, min(ry2, py2) - max(ry1, py1))
        if overlap_x > 0 and overlap_y > 0:
            return sig

    return signatures[0] if signatures else None


def _overlay_page_stamps(pdf, page_obj, signatures, page_width, page_height):
    """Overlay any existing stamp images/text in the page content stream.
    
    Some PDFs have verification stamps drawn directly in the page content
    (not as widget annotations). This covers them with white and draws
    new stamps.
    """
    import pikepdf, re

    existing_stamps = _find_page_stamp_regions(page_obj, page_width, page_height)
    if not existing_stamps:
        return

    for i, sig in enumerate(signatures):
        pos = sig.get("details", {}).get("position")
        signer = sig.get("signer", {})
        intact = sig.get("intact", False)
        trust = sig.get("trust_status", "")

        signer_name = signer.get("common_name", "Unknown")

        if intact and trust == "VALID":
            status = "valid"
        elif intact:
            status = "untrusted"
        else:
            status = "invalid"

        # Find matching stamp to cover
        stamp = None
        if pos:
            sig_cx = (float(pos["x1"]) + float(pos["x2"])) / 2
            sig_cy = (float(pos["y1"]) + float(pos["y2"])) / 2
            best_dist = float("inf")
            for s in existing_stamps:
                scx = (s["x1"] + s["x2"]) / 2
                scy = (s["y1"] + s["y2"]) / 2
                dist = ((sig_cx - scx) ** 2 + (sig_cy - scy) ** 2) ** 0.5
                if dist < best_dist:
                    best_dist = dist
                    stamp = s
            if stamp and best_dist > 300:
                stamp = None
        elif i < len(existing_stamps):
            stamp = existing_stamps[i]

        if not stamp:
            continue

        # Cover existing stamp with white rectangle, then draw checkmark
        sw = stamp["x2"] - stamp["x1"]
        sh = stamp["y2"] - stamp["y1"]

        if status == "valid":
            bg = "0.93 0.99 0.93"
            border = "0.18 0.68 0.18"
            check_color = "0.10 0.52 0.10"
            label = "Signature Verified"
        elif status == "untrusted":
            bg = "1.0 0.97 0.88"
            border = "0.85 0.65 0.13"
            check_color = "0.85 0.65 0.13"
            label = "Verified (untrusted)"
        else:
            bg = "1.0 0.93 0.93"
            border = "0.86 0.15 0.15"
            check_color = "0.86 0.15 0.15"
            label = "Not Verified"

        safe_label = label.replace("(", "\\(").replace(")", "\\)")
        safe_name = signer_name[:25].replace("(", "\\(").replace(")", "\\)")

        # Build the overlay content
        overlay = f"""q
1 1 1 rg 1 1 1 RG 1 w
{stamp['x1']-1} {stamp['y1']-1} {sw+2} {sh+2} re B
{bg} rg {border} RG 1.5 w
{stamp['x1']} {stamp['y1']} {sw} {sh} re B
{check_color} RG 2.5 w
{stamp['x1']+8} {stamp['y1']+sh/2} m {stamp['x1']+12} {stamp['y1']+sh/2-5} l {stamp['x1']+22} {stamp['y1']+sh/2+5} l S
{check_color} rg
/F1B 8 Tf
{stamp['x1']+28} {stamp['y1']+sh/2-3} Td ({safe_label} - {safe_name}) Tj
Q"""

        # Create resources and XObject
        resources = pikepdf.Dictionary({
            "/Font": pikepdf.Dictionary({
                "/F1B": pikepdf.Dictionary({
                    "/Type": pikepdf.Name("/Font"),
                    "/Subtype": pikepdf.Name("/Type1"),
                    "/BaseFont": pikepdf.Name("/Helvetica-Bold"),
                }),
            })
        })

        stream = pikepdf.Stream(pdf, overlay.encode("latin-1"))
        xobj = pikepdf.Dictionary({
            "/Type": pikepdf.Name("/XObject"),
            "/Subtype": pikepdf.Name("/Form"),
            "/BBox": pikepdf.Array([0, 0, sw, sh]),
            "/Resources": resources,
            "/Stream": stream,
        })

        xobj_name = f"/PageStamp{i}"
        if "/Resources" not in page_obj:
            page_obj["/Resources"] = pikepdf.Dictionary()
        if "/XObject" not in page_obj["/Resources"]:
            page_obj["/Resources"]["/XObject"] = pikepdf.Dictionary()
        page_obj["/Resources"]["/XObject"][xobj_name] = xobj

        draw_op = f"q 1 0 0 1 {stamp['x1']} {stamp['y1']} cm {xobj_name} Do Q"
        _append_to_contents(page_obj, pdf, draw_op)


def _find_page_stamp_regions(page_obj, page_width, page_height):
    """Find stamp regions in the page content stream (images + text)."""
    import pikepdf, re

    regions = []
    try:
        content = page_obj.get("/Contents")
        if isinstance(content, pikepdf.Stream):
            data = content.read_bytes().decode("latin-1", errors="replace")
        elif isinstance(content, pikepdf.Array):
            data = b""
            for item in content:
                if isinstance(item, pikepdf.Stream):
                    data += item.read_bytes() + b"\n"
            data = data.decode("latin-1", errors="replace")
        else:
            return regions

        # Find images with verification-related text nearby
        for m in re.finditer(r'q\s*([\d\.\-e\s]+)\s+cm\s+/(\w+)\s+Do\s+Q', data):
            nums = [float(x) for x in m.group(1).split()]
            if len(nums) < 6:
                continue

            img_x, img_y = nums[4], nums[5]
            img_w, img_h = abs(nums[0]), abs(nums[3])

            # Look for text nearby
            after = data[m.end():m.end() + 1500]
            nearby_texts = re.findall(r'\(([^)]+)\)', after)
            combined = " ".join(nearby_texts).lower()

            is_stamp = False
            if any(kw in combined for kw in ["signature not verified", "not verified", "signature verified"]):
                is_stamp = True
            elif 70 < img_w < 130 and 70 < img_h < 130:
                # Question mark images are typically this size
                if img_y < page_height * 0.15:  # Near bottom of page
                    is_stamp = True

            if is_stamp:
                regions.append({
                    "x1": img_x,
                    "y1": img_y,
                    "x2": min(img_x + max(img_w, 250), page_width - 5),
                    "y2": min(img_y + max(img_h, 80), page_height),
                    "img_name": m.group(2),
                })

        # Find text blocks with verification text
        for m in re.finditer(r'Tm', data):
            before = data[max(0, m.end()-200):m.end()]
            nums = re.findall(r'[\d\.\-]+', before.split('Tm')[0] if 'Tm' in before else '')
            if len(nums) >= 2:
                tx, ty = float(nums[-2]), float(nums[-1])
                after = data[m.end():m.end()+600]
                texts = re.findall(r'\(([^)]+)\)', after)
                combined = " ".join(texts).lower()
                if any(kw in combined for kw in ["not verified", "signature not"]):
                    already = any(abs(r["x1"] - tx) < 50 for r in regions)
                    if not already:
                        regions.append({
                            "x1": tx - 10,
                            "y1": ty - 10,
                            "x2": tx + 280,
                            "y2": ty + 90,
                            "img_name": "text_block",
                        })

    except Exception as e:
        import logging
        logging.getLogger(__name__).debug(f"Page stamp scan error: {e}")

    return regions


def _append_to_contents(page_obj, pdf, draw_op):
    """Append drawing operations to the page content stream."""
    import pikepdf

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


def _add_verification_badge(pdf, page_obj, page_width, page_height, is_valid, verification_result):
    """Add a small verification badge at the bottom-left of the page."""
    import pikepdf

    badge_w = 170
    badge_h = 24
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

    xobj_name = "/VerificationBadge"
    if "/Resources" not in page_obj:
        page_obj["/Resources"] = pikepdf.Dictionary()
    if "/XObject" not in page_obj["/Resources"]:
        page_obj["/Resources"]["/XObject"] = pikepdf.Dictionary()
    page_obj["/Resources"]["/XObject"][xobj_name] = xobj

    draw_op = f"q 1 0 0 1 {badge_x} {badge_y} cm {xobj_name} Do Q"
    _append_to_contents(page_obj, pdf, draw_op)


def _get_output_path(original_path: str, prefix: str) -> str:
    """Generate output path for processed PDF."""
    original = Path(original_path)
    output_name = f"{prefix}_{uuid.uuid4().hex[:8]}_{original.name}"
    return str(SIGNED_DIR / output_name)
