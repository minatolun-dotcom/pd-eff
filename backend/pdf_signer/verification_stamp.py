"""Verification stamp service — Acrobat-style clean verification stamps.

Matches Adobe Acrobat's verification appearance:
- Black text, no border
- "Signature valid" header
- Signer name, date, reason, location in small text
- Large green checkmark on the right
- Positioned at signature area, avoiding overlap with existing text
"""
import re
import uuid
from pathlib import Path
import pikepdf
from .config import SIGNED_DIR


def stamp_verification_result(pdf_path: str, verification_result: dict, page: int = 0, stamp_position: dict = None) -> str:
    """Create Acrobat-style verification stamps in the PDF."""
    output_path = _get_output_path(pdf_path, "verified")
    signatures = verification_result.get("signatures", [])

    try:
        pdf = pikepdf.open(pdf_path)
        if len(pdf.pages) == 0:
            pdf.add_blank_page(page_size=(612, 792))

        target_page = min(page, len(pdf.pages) - 1)
        page_obj = pdf.pages[target_page]
        mb = page_obj.get("/MediaBox")
        page_width = float(mb[2]) if mb else 612
        page_height = float(mb[3]) if mb else 792

        _ensure_fonts(page_obj)

        # ── Replace widget annotation appearances ────────────────────
        _replace_widgets(pdf, page_obj, signatures)

        # ── Find existing text blocks to avoid overlap ───────────────
        text_blocks = _find_text_blocks(page_obj, page_width, page_height)
        image_blocks = _find_image_blocks(page_obj, page_width, page_height)

        # ── Draw stamps directly on content stream ──────────────────
        _draw_stamps(pdf, page_obj, signatures, page_width, page_height, text_blocks, image_blocks, stamp_position)

        pdf.save(output_path)
        pdf.close()
    except Exception as e:
        import shutil, logging
        logging.getLogger(__name__).error(f"Stamp failed: {e}", exc_info=True)
        shutil.copy2(pdf_path, output_path)

    return output_path


def _find_text_blocks(page_obj, page_width, page_height):
    """Find all text block positions on the page."""
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
        return []

    blocks = []

    # Find Tm (text matrix) operations
    for m in re.finditer(r'([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+Tm', data):
        tx, ty = float(m.group(5)), float(m.group(6))
        # Get nearby text
        after = data[m.end():m.end() + 300]
        texts = re.findall(r'\(([^)]+)\)', after)
        combined = " ".join(texts)
        if combined.strip():
            # Estimate block size based on text length
            est_w = min(len(combined) * 5, 400)
            blocks.append({
                "x1": tx,
                "y1": ty - 12,  # Approximate text height
                "x2": tx + est_w,
                "y2": ty + 5,
                "text": combined[:50],
            })

    # Find Td (text position) operations
    for m in re.finditer(r'([\d\.\-]+)\s+([\d\.\-]+)\s+Td', data):
        tx, ty = float(m.group(1)), float(m.group(2))
        after = data[m.end():m.end() + 300]
        texts = re.findall(r'\(([^)]+)\)', after)
        combined = " ".join(texts)
        if combined.strip():
            est_w = min(len(combined) * 5, 400)
            blocks.append({
                "x1": tx,
                "y1": ty - 12,
                "x2": tx + est_w,
                "y2": ty + 5,
                "text": combined[:50],
            })

    return blocks


def _find_image_blocks(page_obj, page_width, page_height):
    """Find all image positions on the page."""
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
        return []

    blocks = []
    for m in re.finditer(r'q\s*([\d\.\-e\s]+)\s+cm\s+/(\w+)\s+Do\s+Q', data):
        nums = [float(x) for x in m.group(1).split()]
        if len(nums) >= 6:
            x, y = nums[4], nums[5]
            w, h = abs(nums[0]), abs(nums[3])
            blocks.append({
                "x1": x,
                "y1": y,
                "x2": x + w,
                "y2": y + h,
                "name": m.group(2),
            })

    return blocks


def _find_stamp_position(widget_rect, text_blocks, image_blocks, stamp_w, stamp_h, page_width, page_height):
    """Find the best position for the stamp — scan the ENTIRE page for clear areas.
    
    Strategy:
    1. Generate a grid of candidate positions across the page
    2. Score each by overlap with text and images
    3. Prefer positions BELOW the signature area (bottom of page)
    4. Break ties by proximity to the widget
    """
    # Collect all occupied rectangles (text + images + widget)
    occupied = []
    for b in text_blocks:
        occupied.append((b["x1"], b["y1"], b["x2"], b["y2"]))
    for b in image_blocks:
        occupied.append((b["x1"], b["y1"], b["x2"], b["y2"]))
    if widget_rect:
        occupied.append(widget_rect)

    # Find widget center for proximity scoring
    wcx = (widget_rect[0] + widget_rect[2]) / 2 if widget_rect else page_width / 2
    wcy = (widget_rect[1] + widget_rect[3]) / 2 if widget_rect else page_height / 2

    # Scan a grid across the page (step=20 for performance)
    step = 20
    candidates = []
    for sy in range(int(stamp_h) + 5, int(page_height) - 5, step):
        for sx in range(5, int(page_width - stamp_w) - 5, step):
            candidates.append((sx, sy))

    # Also add candidates near the widget (finer grid)
    if widget_rect:
        wx, wy, ww, wh = widget_rect
        for dy in range(-int(stamp_h) - 30, int(wh + stamp_h + 30), 10):
            for dx in range(-int(stamp_w) - 30, int(ww + stamp_w + 30), 10):
                nx = int(wx + dx)
                ny = int(wy + dy)
                if 0 <= nx <= page_width - stamp_w and 0 <= ny <= page_height - stamp_h:
                    candidates.append((nx, ny))

    best_pos = None
    best_score = float("inf")

    for sx, sy in candidates:
        stamp_rect = (sx, sy, sx + stamp_w, sy + stamp_h)

        # Calculate total overlap area
        total_overlap = 0
        for rect in occupied:
            total_overlap += _rect_overlap(stamp_rect, rect)

        # Prefer positions BELOW the widget (lower y = further down page)
        below_bonus = 0
        if widget_rect and sy + stamp_h < widget_rect[1]:
            below_bonus = 500  # Strongly prefer below

        # Prefer positions near the widget (closer = better)
        scx = sx + stamp_w / 2
        scy = sy + stamp_h / 2
        dist = ((scx - wcx) ** 2 + (scy - wcy) ** 2) ** 0.5

        # Score: lower is better (overlap is bad, distance is slightly bad, below is good)
        score = total_overlap * 10 + dist * 0.5 - below_bonus

        if score < best_score:
            best_score = score
            best_pos = (sx, sy)

    # If no zero-overlap position found, try with relaxed constraints
    if best_pos and best_score > 0:
        # Find the position with minimum overlap
        min_overlap_pos = None
        min_overlap = float("inf")
        for sx, sy in candidates:
            stamp_rect = (sx, sy, sx + stamp_w, sy + stamp_h)
            total_overlap = sum(_rect_overlap(stamp_rect, r) for r in occupied)
            if total_overlap < min_overlap:
                min_overlap = total_overlap
                min_overlap_pos = (sx, sy)
        if min_overlap_pos:
            best_pos = min_overlap_pos

    if not best_pos:
        # Absolute fallback: bottom-right corner
        best_pos = (int(page_width - stamp_w - 15), 15)

    return best_pos


def _rect_overlap(r1, r2):
    """Calculate overlap area between two rectangles."""
    x_overlap = max(0, min(r1[2], r2[2]) - max(r1[0], r2[0]))
    y_overlap = max(0, min(r1[3], r2[3]) - max(r1[1], r2[1]))
    return x_overlap * y_overlap


def _replace_widgets(pdf, page_obj, signatures):
    """Replace widget annotation appearances."""
    annots = page_obj.get("/Annots")
    if not annots:
        return

    for annot in annots:
        if not isinstance(annot, pikepdf.Dictionary) or "/AP" not in annot or "/Rect" not in annot:
            continue

        rect = annot["/Rect"]
        rx1, ry1, rx2, ry2 = float(rect[0]), float(rect[1]), float(rect[2]), float(rect[3])
        w, h = rx2 - rx1, ry2 - ry1
        if w < 10 or h < 10:
            continue

        sig = _find_sig_for_rect(rx1, ry1, rx2, ry2, signatures)
        signer_name = sig["signer"]["common_name"] if sig else "Unknown"
        status, status_text = _get_status(sig)
        signing_time = sig.get("timestamps", {}).get("signing_time", "") if sig else ""

        def safe(s):
            return str(s).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")[:35] if s else ""

        time_str = _format_time(signing_time)

        # Remove the widget's visual appearance entirely to eliminate
        # the white box from PyHanko's default TextStampStyle.
        # The verification stamp is drawn on the content stream instead.
        try:
            del annot["/AP"]
        except Exception:
            pass


def _draw_stamps(pdf, page_obj, signatures, page_width, page_height, text_blocks, image_blocks, stamp_position=None):
    """Draw Acrobat-style verification stamps on the page content stream."""
    widget_rects = _get_widget_rects(page_obj)

    all_commands = []

    for i, sig in enumerate(signatures):
        pos = sig.get("details", {}).get("position")
        signer = sig.get("signer", {})
        signer_name = signer.get("common_name", "Unknown")
        reason = sig.get("details", {}).get("reason", "")
        location = sig.get("details", {}).get("location", "")
        signing_time = sig.get("timestamps", {}).get("signing_time", "")
        status, status_text = _get_status(sig)

        def safe(s):
            return str(s).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")[:40] if s else ""

        time_str = _format_time(signing_time)

        # Stamp dimensions — compact like Acrobat
        stamp_w, stamp_h = 210, 80

        # Find widget rect for positioning
        widget_rect = _find_widget_for_sig(pos, widget_rects) if pos else None

        # Smart positioning — use override if provided, else auto-detect
        if stamp_position and i == 0:  # Only first stamp uses user position
            sx = max(5, min(stamp_position["x"], page_width - stamp_w - 5))
            sy = max(5, min(stamp_position["y"], page_height - stamp_h - 5))
            stamp_w = stamp_position.get("w", stamp_w)
            stamp_h = stamp_position.get("h", stamp_h)
        else:
            sx, sy = _find_stamp_position(widget_rect, text_blocks, image_blocks, stamp_w, stamp_h, page_width, page_height)

        # ── Acrobat-style stamp ─────────────────────────────────────
        # No border, no background — just text and green checkmark
        # Green checkmark coordinates (right side, big like Acrobat)
        ck_x = stamp_w - 30
        ck_y = stamp_h / 2 + 5

        # Use Tm (absolute positioning) for each line to avoid overlap
        y_title = stamp_h - 14
        y_signed = y_title - 16
        y_date = y_signed - 13
        y_reason = y_date - 12
        y_location = y_reason - 12

        stamp_ops = f"""BT
0 0 0 rg
/F2 13 Tf
1 0 0 1 0 {y_title} Tm ({safe(status_text)}) Tj
/F1 8 Tf
1 0 0 1 0 {y_signed} Tm (Digitally signed by {safe(signer_name[:30])}) Tj"""
        if time_str:
            stamp_ops += f"""
1 0 0 1 0 {y_date} Tm (Date: {safe(time_str)}) Tj"""
        if reason:
            stamp_ops += f"""
1 0 0 1 0 {y_reason} Tm (Reason: {safe(reason[:30])}) Tj"""
        if location:
            stamp_ops += f"""
1 0 0 1 0 {y_location} Tm (Location: {safe(location[:30])}) Tj"""
        stamp_ops += f"""
ET
0.13 0.55 0.13 RG
0.13 0.55 0.13 rg
4 w
{ck_x} {ck_y} m {ck_x+6} {ck_y-10} l {ck_x+22} {ck_y+8} l S
{ck_x+13} {ck_y-1} 14 0 360 arc S
"""

        # Wrap with translation
        all_commands.append(f"q 1 0 0 1 {sx} {sy} cm\n{stamp_ops}\nQ")

    combined = "\n".join(all_commands)
    _append_to_contents(page_obj, pdf, combined)


def _format_time(signing_time):
    if not signing_time or signing_time == "Unknown":
        return ""
    ts = str(signing_time)[:35]
    if "D:" in ts:
        try:
            parts = ts.replace("D:", "").split("+")[0]
            return f"{parts[:4]}.{parts[4:6]}.{parts[6:8]} {parts[8:10]}:{parts[10:12]}:{parts[12:14]} IST"
        except Exception:
            return ts[:25]
    return ts[:25]


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
        return "valid", "Signature valid"
    elif intact:
        return "untrusted", "Signature valid (untrusted)"
    else:
        return "invalid", "Signature Not Verified"


def _ensure_fonts(page_obj):
    if "/Resources" not in page_obj:
        page_obj["/Resources"] = pikepdf.Dictionary()
    if "/Font" not in page_obj["/Resources"]:
        page_obj["/Resources"]["/Font"] = pikepdf.Dictionary()
    fonts = page_obj["/Resources"]["/Font"]
    for name, base in [("/F1", "/Helvetica"), ("/F2", "/Helvetica-Bold")]:
        if name not in fonts:
            fonts[name] = pikepdf.Dictionary({
                "/Type": pikepdf.Name("/Font"),
                "/Subtype": pikepdf.Name("/Type1"),
                "/BaseFont": pikepdf.Name(base),
            })


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
