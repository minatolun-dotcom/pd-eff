"""Verification stamp service — replaces 'Signature Not Verified' stamps.

Approach:
1. Replace widget annotation appearance (renders in Acrobat & most viewers)
2. Draw matching stamps on page content stream (fallback for browser viewers)
3. Position stamps to avoid overlapping QR codes and other content
"""
import re
import uuid
from pathlib import Path
import pikepdf
from .config import SIGNED_DIR


def stamp_verification_result(pdf_path: str, verification_result: dict, page: int = 0) -> str:
    """Create Acrobat-style verification stamps in the PDF."""
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

        _ensure_resources(page_obj)

        # ── Step 1: Replace widget annotation appearances ────────────
        _replace_widget_appearances(pdf, page_obj, signatures)

        # ── Step 2: Draw stamps on page content stream ──────────────
        _draw_page_stamps(pdf, page_obj, signatures, page_width, page_height)

        # ── Step 3: Add verification badge ──────────────────────────
        _add_verification_badge(pdf, page_obj, page_width, page_height, is_valid, verification_result)

        pdf.save(output_path)
        pdf.close()
    except Exception as e:
        import shutil, logging
        logging.getLogger(__name__).error(f"Stamp failed: {e}", exc_info=True)
        shutil.copy2(pdf_path, output_path)

    return output_path


# ═══════════════════════════════════════════════════════════════════
# Step 1: Replace widget annotation appearances
# ═══════════════════════════════════════════════════════════════════

def _replace_widget_appearances(pdf, page_obj, signatures):
    """Replace /Sig widget annotation appearances with verified stamps."""
    annots = page_obj.get("/Annots")
    if not annots:
        return

    for annot in annots:
        if not isinstance(annot, pikepdf.Dictionary):
            continue
        if "/AP" not in annot:
            continue

        rect = annot.get("/Rect")
        if not rect:
            continue

        rx1, ry1, rx2, ry2 = float(rect[0]), float(rect[1]), float(rect[2]), float(rect[3])
        w = rx2 - rx1
        h = ry2 - ry1
        if w < 10 or h < 10:
            continue

        # Find matching signature
        sig = _find_sig_for_rect(rx1, ry1, rx2, ry2, signatures)
        signer_name = sig["signer"]["common_name"] if sig else "Unknown"
        signer_org = sig["signer"].get("organization", "") if sig else ""
        signer_title = sig["signer"].get("title", "") if sig else ""
        status, status_text = _get_status(sig)
        reason = sig["details"].get("reason", "") if sig else ""
        location = sig["details"].get("location", "") if sig else ""
        signing_time = sig.get("timestamps", {}).get("signing_time", "") if sig else ""
        sub_filter = sig["details"].get("sub_filter", "") if sig else ""

        # Create verified appearance
        ap = annot["/AP"]
        # The /N might be a Form XObject or a dict of states
        new_ap = _create_verified_form(
            pdf, w, h,
            signer_name, signer_org, signer_title,
            status, status_text,
            reason, location, signing_time, sub_filter,
        )
        ap["/N"] = new_ap


def _create_verified_form(pdf, w, h, signer_name, signer_org, signer_title,
                          status, status_text, reason, location, signing_time, sub_filter):
    """Create a Form XObject with verified stamp content."""
    def safe(s):
        return str(s).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")[:40] if s else ""

    if status == "valid":
        bg, bc, sc = "0.93 0.99 0.93", "0.18 0.68 0.18", "0.10 0.52 0.10"
    elif status == "untrusted":
        bg, bc, sc = "1.0 0.97 0.88", "0.85 0.65 0.13", "0.72 0.52 0.05"
    else:
        bg, bc, sc = "1.0 0.93 0.93", "0.86 0.15 0.15", "0.72 0.10 0.10"

    # Compact layout for small widget rects
    lines = [
        "q",
        f"{bg} rg", f"{bc} RG", "1 w",
        f"0 0 {w} {h} re B",
    ]

    # Checkmark
    cx, cy = 6, h / 2 + 1
    lines.extend([f"{sc} RG", "2 w",
        f"{cx} {cy} m {cx+3} {cy-4} l {cx+11} {cy+4} l S",
        f"{cx+5.5} {cy-0.5} 8 0 360 arc S",
    ])

    # Text
    lines.extend([
        "0.45 0.45 0.45 rg", "/F1 7 Tf", f"18 {h-10} Td (Signed by :) Tj",
        "0 0 0 rg", "/F1B 8 Tf", f"0 -8 Td ({safe(signer_name[:25])}) Tj",
    ])

    time_str = signing_time[:20] if signing_time and signing_time != "Unknown" else ""
    if "D:" in str(time_str):
        try:
            parts = str(time_str).replace("D:", "").split("+")[0]
            time_str = f"{parts[:4]}.{parts[4:6]}.{parts[6:8]}"
        except Exception:
            pass
    lines.extend([
        f"{sc} rg", "/F1B 7 Tf",
        f"0 -9 Td ({safe(status_text + '  |  ' + str(time_str)[:20])}) Tj",
    ])

    lines.append("Q")

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

    stream = pikepdf.Stream(pdf, "\n".join(lines).encode("latin-1"))
    return pikepdf.Dictionary({
        "/Type": pikepdf.Name("/XObject"),
        "/Subtype": pikepdf.Name("/Form"),
        "/BBox": pikepdf.Array([0, 0, w, h]),
        "/Resources": resources,
        "/Stream": stream,
    })


# ═══════════════════════════════════════════════════════════════════
# Step 2: Draw stamps on page content stream (for browser viewers)
# ═══════════════════════════════════════════════════════════════════

def _draw_page_stamps(pdf, page_obj, signatures, page_width, page_height):
    """Draw verification stamps directly on the page content stream."""
    widget_rects = _get_widget_rects(page_obj)
    occupied = set()  # Track occupied regions to avoid overlap

    for i, sig in enumerate(signatures):
        pos = sig.get("details", {}).get("position")
        signer = sig.get("signer", {})
        signer_name = signer.get("common_name", "Unknown")
        signer_org = signer.get("organization", "")
        signer_title = signer.get("title", "")
        reason = sig.get("details", {}).get("reason", "")
        location = sig.get("details", {}).get("location", "")
        signing_time = sig.get("timestamps", {}).get("signing_time", "")
        sub_filter = sig.get("details", {}).get("sub_filter", "")
        status, status_text = _get_status(sig)

        # Find the widget rect for this signature
        widget_rect = _find_widget_for_sig(pos, widget_rects) if pos else None

        # ── Position calculation ────────────────────────────────────
        # Place stamp ABOVE the widget/signature, in clear space
        if widget_rect:
            wx, wy, ww, wh = widget_rect
            # Place above the widget
            sw, sh = 230, 95
            sx = wx - (sw - ww) / 2  # Center above widget
            sy = wy + wh + 5  # Just above widget
            # Ensure stays on page
            if sy + sh > page_height - 5:
                sy = wy - sh - 5  # Place below if no room above
            sx = max(5, min(sx, page_width - sw - 5))
            sy = max(5, sy)
        elif pos:
            px = float(pos["x1"])
            py = float(pos["y1"])
            sw, sh = 230, 95
            sx = px
            sy = py - sh - 10
            if sy < 5:
                sy = float(pos["y2"]) + 10
            sx = max(5, min(sx, page_width - sw - 5))
        else:
            sw, sh = 230, 95
            sx = page_width - sw - 15
            sy = 45  # Above the badge

        # ── Build stamp content ─────────────────────────────────────
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

        xobj_name = f"/Stamp{i}"
        page_obj["/Resources"]["/XObject"][xobj_name] = xobj

        draw_op = f"q 1 0 0 1 {sx} {sy} cm {xobj_name} Do Q"
        _append_to_contents(page_obj, pdf, draw_op)


def _find_old_stamp_area(page_obj, page_width, page_height):
    """Find the area containing 'Signature Not Verified' or question mark."""
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
        return None

    # Find images that are likely verification stamps (small, near bottom)
    for m in re.finditer(r'q\s*([\d\.\-e\s]+)\s+cm\s+/(\w+)\s+Do\s+Q', data):
        nums = [float(x) for x in m.group(1).split()]
        if len(nums) < 6:
            continue
        x, y = nums[4], nums[5]
        w, h = abs(nums[0]), abs(nums[3])

        # Question mark images are typically 80-120px, near bottom
        if 70 < w < 130 and 70 < h < 130 and y < page_height * 0.2:
            # Check nearby for stamp text
            after = data[m.end():m.end() + 1500]
            texts = re.findall(r'\(([^)]+)\)', after)
            combined = " ".join(texts).lower()
            if any(kw in combined for kw in ["signature", "verified", "digitally", "not verified", "certificate"]):
                return {
                    "x1": x - 5,
                    "y1": y - 5,
                    "x2": x + max(w, 260),
                    "y2": y + max(h, 90),
                }

    # Look for text blocks with "Not Verified"
    for m in re.finditer(r'(\d+\.?\d*)\s+(\d+\.?\d*)\s+Tm', data):
        tx, ty = float(m.group(1)), float(m.group(2))
        after = data[m.end():m.end() + 600]
        texts = re.findall(r'\(([^)]+)\)', after)
        combined = " ".join(texts).lower()
        if any(kw in combined for kw in ["not verified", "signature not"]):
            return {
                "x1": tx - 10,
                "y1": ty - 10,
                "x2": tx + 260,
                "y2": ty + 90,
            }

    return None


def _build_stamp_content(w, h, signer_name, signer_org, signer_title,
                         status, status_text, reason, location, signing_time, sub_filter):
    """Build PDF content stream for a verification stamp."""
    def safe(s):
        return str(s).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")[:40] if s else ""

    if status == "valid":
        bg, bc, sc = "0.93 0.99 0.93", "0.18 0.68 0.18", "0.10 0.52 0.10"
    elif status == "untrusted":
        bg, bc, sc = "1.0 0.97 0.88", "0.85 0.65 0.13", "0.72 0.52 0.05"
    else:
        bg, bc, sc = "1.0 0.93 0.93", "0.86 0.15 0.15", "0.72 0.10 0.10"

    lines = [
        "q",
        f"{bg} rg", f"{bc} RG", "1.5 w",
        f"0 0 {w} {h} re B",
        # Header
        "0.45 0.45 0.45 rg", "/F1 9 Tf",
        f"10 {h - 16} Td (Signed by :) Tj",
        # Name
        "0 0 0 rg", "/F1B 11 Tf",
        f"0 -15 Td ({safe(signer_name[:35])}) Tj",
    ]

    # Org/title
    org_line = ""
    if signer_org:
        org_line = signer_org[:35]
    if signer_title:
        org_line += f" , {signer_title}" if org_line else signer_title[:35]
    if org_line:
        lines.extend(["/F1 8 Tf", f"0 -12 Td ({safe(org_line[:40])}) Tj"])

    # Status
    lines.extend([
        "0 -8 Td",
        f"{sc} rg", "/F1B 10 Tf",
        f"({safe(status_text)}) Tj",
    ])

    # Checkmark on right
    cx = w - 28
    cy = h - 28
    lines.extend([f"{sc} RG", f"{sc} rg"])
    if status == "valid":
        lines.extend([
            "2.5 w",
            f"{cx} {cy} m {cx+5} {cy-7} l {cx+15} {cy+5} l S",
            f"{cx+7.5} {cy-1} 10 0 360 arc S",
        ])
    elif status == "untrusted":
        lines.extend(["/F1B 18 Tf", f"{cx-1} {cy-5} Td (?) Tj"])
    else:
        lines.extend([
            "2.5 w",
            f"{cx} {cy+5} m {cx+14} {cy-8} l S",
            f"{cx+14} {cy+5} m {cx} {cy-8} l S",
        ])

    # Details
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


# ═══════════════════════════════════════════════════════════════════
# Step 3: Verification badge
# ═══════════════════════════════════════════════════════════════════

def _add_verification_badge(pdf, page_obj, page_width, page_height, is_valid, verification_result):
    """Add verification badge at bottom-left."""
    badge_w, badge_h = 180, 26
    badge_x, badge_y = 15, 15

    if is_valid:
        bg, bc, tc = "0.85 0.95 0.85", "0.18 0.68 0.18", "0.10 0.52 0.10"
        label = "Signature Verified"
    else:
        overall = verification_result.get("overall_status", "")
        if overall == "NO_SIGNATURES":
            bg, bc, tc = "0.95 0.95 0.85", "0.85 0.65 0.13", "0.72 0.52 0.05"
            label = "No Signatures"
        else:
            bg, bc, tc = "0.95 0.85 0.85", "0.86 0.15 0.15", "0.72 0.10 0.10"
            label = "Verification Failed"

    safe_label = label.replace("(", "\\(").replace(")", "\\)")
    sig_count = verification_result.get("signature_count", 0)

    content = f"""q
{bg} rg {bc} RG 1 w
0 0 {badge_w} {badge_h} re B
{tc} rg
/F1B 9 Tf 8 8 Td ({safe_label}) Tj
/F1 7 Tf 0 -1 Td ({sig_count} signature(s) verified) Tj
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

    page_obj["/Resources"]["/XObject"]["/VerificationBadge"] = xobj
    draw_op = f"q 1 0 0 1 {badge_x} {badge_y} cm /VerificationBadge Do Q"
    _append_to_contents(page_obj, pdf, draw_op)


# ═══════════════════════════════════════════════════════════════════
# Utilities
# ═══════════════════════════════════════════════════════════════════

def _ensure_resources(page_obj):
    if "/Resources" not in page_obj:
        page_obj["/Resources"] = pikepdf.Dictionary()
    if "/XObject" not in page_obj["/Resources"]:
        page_obj["/Resources"]["/XObject"] = pikepdf.Dictionary()


def _get_widget_rects(page_obj):
    rects = []
    annots = page_obj.get("/Annots")
    if not annots:
        return rects
    for annot in annots:
        if not isinstance(annot, pikepdf.Dictionary):
            continue
        rect = annot.get("/Rect")
        if rect:
            rects.append((float(rect[0]), float(rect[1]), float(rect[2]), float(rect[3])))
    return rects


def _find_widget_for_sig(position, widget_rects):
    if not position or not widget_rects:
        return None
    px = (float(position["x1"]) + float(position["x2"])) / 2
    py = (float(position["y1"]) + float(position["y2"])) / 2
    best, best_dist = None, float("inf")
    for rect in widget_rects:
        rcx = (rect[0] + rect[2]) / 2
        rcy = (rect[1] + rect[3]) / 2
        dist = ((px - rcx) ** 2 + (py - rcy) ** 2) ** 0.5
        if dist < best_dist:
            best_dist = dist
            best = rect
    return best if best and best_dist < 200 else None


def _find_sig_for_rect(rx1, ry1, rx2, ry2, signatures):
    for sig in signatures:
        pos = sig.get("details", {}).get("position")
        if not pos:
            continue
        px1, py1 = float(pos["x1"]), float(pos["y1"])
        px2, py2 = float(pos["x2"]), float(pos["y2"])
        if max(0, min(rx2, px2) - max(rx1, px1)) > 0 and max(0, min(ry2, py2) - max(ry1, py1)) > 0:
            return sig
    return signatures[0] if signatures else None


def _get_status(sig):
    if not sig:
        return "invalid", "Signature Not Verified"
    intact = sig.get("intact", False)
    trust = sig.get("trust_status", "")
    if intact and trust == "VALID":
        return "valid", "Signature Verified"
    elif intact:
        return "untrusted", "Signature Verified (untrusted)"
    else:
        return "invalid", "Signature Not Verified"


def _append_to_contents(page_obj, pdf, draw_op):
    if "/Contents" in page_obj:
        existing = page_obj["/Contents"]
        if isinstance(existing, pikepdf.Stream):
            old = existing.read_bytes()
            page_obj["/Contents"] = pikepdf.Stream(pdf, old + b"\n" + draw_op.encode("latin-1"))
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
    original = Path(original_path)
    output_name = f"{prefix}_{uuid.uuid4().hex[:8]}_{original.name}"
    return str(SIGNED_DIR / output_name)
