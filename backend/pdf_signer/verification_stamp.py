"""Verification stamp service — Acrobat-style clean verification stamps.

Matches Adobe Acrobat's verification appearance:
- White background
- "Signature valid" header
- Signer name, date, reason, location in small text
- Green checkmark on the right
- Positioned exactly at the signature widget location
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

        # ── Draw stamps directly on content stream ──────────────────
        _draw_stamps(pdf, page_obj, signatures, page_width, page_height)

        pdf.save(output_path)
        pdf.close()
    except Exception as e:
        import shutil, logging
        logging.getLogger(__name__).error(f"Stamp failed: {e}", exc_info=True)
        shutil.copy2(pdf_path, output_path)

    return output_path


def _replace_widgets(pdf, page_obj, signatures):
    """Replace widget annotation appearances with Acrobat-style verified stamps."""
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

        # Compact widget appearance
        content = f"""q
1 1 1 rg 0.7 0.7 0.7 RG 0.5 w
0 0 {w} {h} re S
0 0 0 rg /F1 8 Tf
2 {h-10} Td ({safe(status_text)}) Tj
0.13 0.55 0.13 rg
20 {h/2-2} m 24 {h/2-6} l 32 {h/2+4} l S
0 0 0 rg /F1 6 Tf
38 {h/2-2} Td ({safe(signer_name[:20])}) Tj
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
        annot["/AP"]["/N"] = pikepdf.Dictionary({
            "/Type": pikepdf.Name("/XObject"),
            "/Subtype": pikepdf.Name("/Form"),
            "/BBox": pikepdf.Array([0, 0, w, h]),
            "/Resources": resources,
            "/Stream": stream,
        })


def _draw_stamps(pdf, page_obj, signatures, page_width, page_height):
    """Draw Acrobat-style verification stamps directly on the page content stream.

    Style matches Adobe Acrobat:
    - White/light gray background (subtle border)
    - "Signature valid" header
    - "Digitally signed by NAME"
    - Date, Reason, Location in small gray text
    - Green checkmark on the right
    - Positioned at the widget annotation location
    """
    widget_rects = _get_widget_rects(page_obj)

    all_commands = []

    for i, sig in enumerate(signatures):
        pos = sig.get("details", {}).get("position")
        signer = sig.get("signer", {})
        signer_name = signer.get("common_name", "Unknown")
        signer_org = signer.get("organization", "")
        signer_title = signer.get("title", "")
        reason = sig.get("details", {}).get("reason", "")
        location = sig.get("details", {}).get("location", "")
        signing_time = sig.get("timestamps", {}).get("signing_time", "")
        status, status_text = _get_status(sig)

        # Find widget rect for positioning
        widget_rect = _find_widget_for_sig(pos, widget_rects) if pos else None

        def safe(s):
            return str(s).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")[:40] if s else ""

        time_str = _format_time(signing_time)

        # ── Position: expand from widget rect to show full stamp ─────
        # Acrobat stamp is about 200×70 at the signature location
        stamp_w, stamp_h = 200, 75

        if widget_rect:
            # Place the stamp at the widget position, extending left
            wx, wy, ww, wh = widget_rect
            sx = wx - (stamp_w - ww)  # Extend left from widget
            sy = wy - (stamp_h - wh) / 2  # Center vertically on widget
            # Keep on page
            sx = max(5, min(sx, page_width - stamp_w - 5))
            sy = max(5, min(sy, page_height - stamp_h - 5))
        elif pos:
            sx = max(5, min(float(pos["x1"]), page_width - stamp_w - 5))
            sy = float(pos["y1"]) - stamp_h - 5
            if sy < 5:
                sy = float(pos["y2"]) + 5
        else:
            sx = page_width - stamp_w - 15
            sy = page_height - stamp_h - 15

        # ── Acrobat-style stamp (white bg, small text, green check) ──
        # Colors
        text_color = "0 0 0"           # Black
        gray_color = "0.4 0.4 0.4"     # Gray for details
        green = "0.13 0.55 0.13"       # Dark green for checkmark
        border_color = "0.75 0.75 0.75"  # Light gray border

        # Checkmark coordinates (right side)
        ck_x = stamp_w - 25
        ck_y = stamp_h / 2 + 5

        # Build the stamp content stream
        # We use q + translate to position the stamp at (sx, sy)
        stamp_ops = f"""q
{border_color} RG
0.5 w
0 0 {stamp_w} {stamp_h} re S
BT
{green} rg
/F2 14 Tf
4 {stamp_h - 18} Td ({safe(status_text)}) Tj
{gray_color} rg
/F1 8 Tf
0 -14 Td (Digitally signed by {safe(signer_name)}) Tj"""
        if time_str:
            stamp_ops += f"""
0 -11 Td (Date: {safe(time_str)}) Tj"""
        if reason:
            stamp_ops += f"""
0 -10 Td (Reason: {safe(reason[:30])}) Tj"""
        if location:
            stamp_ops += f"""
0 -10 Td (Location: {safe(location[:30])}) Tj"""
        stamp_ops += f"""
ET
{green} RG
{green} rg
3 w
{ck_x} {ck_y} m {ck_x+5} {ck_y-8} l {ck_x+18} {ck_y+8} l S
{ck_x+10} {ck_y-1} 11 0 360 arc S
Q"""

        # Wrap with translation to position at (sx, sy)
        all_commands.append(f"q 1 0 0 1 {sx} {sy} cm\n{stamp_ops}\nQ")

    # ── Append ALL commands to content stream ────────────────────────
    combined = "\n".join(all_commands)
    _append_to_contents(page_obj, pdf, combined)


def _format_time(signing_time):
    """Format signing time to readable string."""
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
    """Ensure the page has Helvetica fonts."""
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
