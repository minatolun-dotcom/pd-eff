"""Verification stamp service — draws stamps directly on page content stream.

Uses raw PDF content stream operators (BT/ET with Tf/Td) instead of Form XObjects,
for maximum compatibility with all PDF viewers.
"""
import re
import uuid
from pathlib import Path
import pikepdf
from .config import SIGNED_DIR


def stamp_verification_result(pdf_path: str, verification_result: dict, page: int = 0) -> str:
    """Create verification stamps in the PDF."""
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

        # ── Step 1: Replace widget annotation appearances ────────────
        _replace_widgets(pdf, page_obj, signatures)

        # ── Step 2: Draw stamps on page content stream ──────────────
        _draw_stamps(pdf, page_obj, signatures, page_width, page_height, is_valid, verification_result)

        pdf.save(output_path)
        pdf.close()
    except Exception as e:
        import shutil, logging
        logging.getLogger(__name__).error(f"Stamp failed: {e}", exc_info=True)
        shutil.copy2(pdf_path, output_path)

    return output_path


def _replace_widgets(pdf, page_obj, signatures):
    """Replace widget annotation appearances with verified stamps."""
    annots = page_obj.get("/Annots")
    if not annots:
        return

    for annot in annots:
        if not isinstance(annot, pikepdf.Dictionary):
            continue
        if "/AP" not in annot or "/Rect" not in annot:
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

        if status == "valid":
            bg, bc, sc = "0.93 0.99 0.93", "0.18 0.68 0.18", "0.10 0.52 0.10"
        elif status == "untrusted":
            bg, bc, sc = "1.0 0.97 0.88", "0.85 0.65 0.13", "0.72 0.52 0.05"
        else:
            bg, bc, sc = "1.0 0.93 0.93", "0.86 0.15 0.15", "0.72 0.10 0.10"

        # Build compact appearance content stream
        cx, cy = 6, h / 2 + 1
        time_str = ""
        if signing_time and signing_time != "Unknown":
            ts = str(signing_time)[:20]
            if "D:" in ts:
                try:
                    parts = ts.replace("D:", "").split("+")[0]
                    time_str = f"{parts[:4]}.{parts[4:6]}.{parts[6:8]}"
                except Exception:
                    time_str = ts

        content = f"""q
{bg} rg {bc} RG 1 w
0 0 {w} {h} re B
{sc} RG 2 w
{cx} {cy} m {cx+3} {cy-4} l {cx+11} {cy+4} l S
{cx+5.5} {cy-0.5} 8 0 360 arc S
0.45 0.45 0.45 rg /F1 7 Tf 18 {h-10} Td (Signed by :) Tj
0 0 0 rg /F1B 8 Tf 0 -8 Td ({safe(signer_name[:25])}) Tj
{sc} rg /F1B 7 Tf 0 -9 Td ({safe(status_text + '  |  ' + time_str[:20])}) Tj
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
        form = pikepdf.Dictionary({
            "/Type": pikepdf.Name("/XObject"),
            "/Subtype": pikepdf.Name("/Form"),
            "/BBox": pikepdf.Array([0, 0, w, h]),
            "/Resources": resources,
            "/Stream": stream,
        })

        annot["/AP"]["/N"] = form


def _draw_stamps(pdf, page_obj, signatures, page_width, page_height, is_valid, verification_result):
    """Draw verification stamps directly on the page content stream."""
    # Ensure Resources/XObject exists
    if "/Resources" not in page_obj:
        page_obj["/Resources"] = pikepdf.Dictionary()
    if "/XObject" not in page_obj["/Resources"]:
        page_obj["/Resources"]["/XObject"] = pikepdf.Dictionary()

    widget_rects = _get_widget_rects(page_obj)

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

        # Find widget rect for positioning
        widget_rect = _find_widget_for_sig(pos, widget_rects) if pos else None

        # ── Position: above widget, in clear space ──────────────────
        sw, sh = 240, 100
        if widget_rect:
            wx, wy, ww, wh = widget_rect
            sx = max(5, min(wx - (sw - ww) / 2, page_width - sw - 5))
            sy = wy + wh + 8  # Above widget
            if sy + sh > page_height - 5:
                sy = wy - sh - 8  # Below if no room
        elif pos:
            sx = max(5, min(float(pos["x1"]), page_width - sw - 5))
            sy = float(pos["y1"]) - sh - 10
            if sy < 5:
                sy = float(pos["y2"]) + 10
        else:
            sx = page_width - sw - 15
            sy = 50  # Above badge

        # ── Build stamp as Form XObject ─────────────────────────────
        def safe(s):
            return str(s).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")[:40] if s else ""

        if status == "valid":
            bg, bc, sc = "0.93 0.99 0.93", "0.18 0.68 0.18", "0.10 0.52 0.10"
        elif status == "untrusted":
            bg, bc, sc = "1.0 0.97 0.88", "0.85 0.65 0.13", "0.72 0.52 0.05"
        else:
            bg, bc, sc = "1.0 0.93 0.93", "0.86 0.15 0.15", "0.72 0.10 0.10"

        time_str = ""
        if signing_time and signing_time != "Unknown":
            ts = str(signing_time)[:35]
            if "D:" in ts:
                try:
                    parts = ts.replace("D:", "").split("+")[0]
                    time_str = f"{parts[:4]}.{parts[4:6]}.{parts[6:8]} {parts[8:10]}:{parts[10:12]}:{parts[12:14]}"
                except Exception:
                    time_str = ts
            else:
                time_str = ts[:25]

        # Checkmark coordinates
        ck_x, ck_y = sw - 28, sh - 28

        if status == "valid":
            check_op = (
                f"{ck_x} {ck_y} m {ck_x+5} {ck_y-7} l {ck_x+15} {ck_y+5} l S "
                f"{ck_x+7.5} {ck_y-1} 10 0 360 arc S"
            )
        elif status == "untrusted":
            check_op = f"20 Tf {ck_x-2} {ck_y-6} Td (?) Tj 10 Tf"
        else:
            check_op = (
                f"{ck_x} {ck_y+5} m {ck_x+14} {ck_y-8} l S "
                f"{ck_x+14} {ck_y+5} m {ck_x} {ck_y-8} l S"
            )

        org_line = ""
        if signer_org:
            org_line = signer_org[:35]
        if signer_title:
            org_line += f" , {signer_title}" if org_line else signer_title[:35]

        content = f"""q
{bg} rg {bc} RG 1.5 w
0 0 {sw} {sh} re B
0.45 0.45 0.45 rg /F1 9 Tf
10 {sh-16} Td (Signed by :) Tj
0 0 0 rg /F1B 11 Tf
0 -15 Td ({safe(signer_name[:35])}) Tj"""
        if org_line:
            content += f"\n/F1 8 Tf 0 -12 Td ({safe(org_line[:40])}) Tj"
        content += f"""
{sc} rg /F1B 10 Tf 0 -8 Td ({safe(status_text)}) Tj
{sc} RG {sc} rg 2.5 w
{check_op}
0 0 0 rg /F1 7 Tf"""
        if time_str:
            content += f"\n0 -10 Td (Date: {safe(time_str)}) Tj"
        if reason:
            content += f"\n0 -10 Td (Reason: {safe(reason[:30])}) Tj"
        if location:
            content += f"\n0 -10 Td (Location: {safe(location[:30])}) Tj"
        content += "\nQ"

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

        # ── Draw stamp and badge using q...cm...Do...Q ──────────────
        stamp_draw = f"q 1 0 0 1 {sx} {sy} cm {xobj_name} Do Q"

        # Verification badge at bottom-left
        badge_w, badge_h = 180, 26
        badge_x, badge_y = 15, 15
        if is_valid:
            bg2, bc2, tc2 = "0.85 0.95 0.85", "0.18 0.68 0.18", "0.10 0.52 0.10"
            label = "Signature Verified"
        else:
            overall = verification_result.get("overall_status", "")
            if overall == "NO_SIGNATURES":
                bg2, bc2, tc2 = "0.95 0.95 0.85", "0.85 0.65 0.13", "0.72 0.52 0.05"
                label = "No Signatures"
            else:
                bg2, bc2, tc2 = "0.95 0.85 0.85", "0.86 0.15 0.15", "0.72 0.10 0.10"
                label = "Verification Failed"
        sig_count = verification_result.get("signature_count", 0)
        safe_label = label.replace("(", "\\(").replace(")", "\\)")

        badge_content = f"""q
{bg2} rg {bc2} RG 1 w
0 0 {badge_w} {badge_h} re B
{tc2} rg /F1B 9 Tf
8 8 Td ({safe_label}) Tj
/F1 7 Tf 0 -1 Td ({sig_count} signature(s) verified) Tj
Q"""

        badge_resources = pikepdf.Dictionary({
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

        badge_stream = pikepdf.Stream(pdf, badge_content.encode("latin-1"))
        badge_xobj = pikepdf.Dictionary({
            "/Type": pikepdf.Name("/XObject"),
            "/Subtype": pikepdf.Name("/Form"),
            "/BBox": pikepdf.Array([0, 0, badge_w, badge_h]),
            "/Resources": badge_resources,
            "/Stream": badge_stream,
        })

        page_obj["/Resources"]["/XObject"]["/VerificationBadge"] = badge_xobj
        badge_draw = f"q 1 0 0 1 {badge_x} {badge_y} cm /VerificationBadge Do Q"

        # ── Append to content stream ────────────────────────────────
        _append_to_contents(page_obj, pdf, stamp_draw + "\n" + badge_draw)


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
