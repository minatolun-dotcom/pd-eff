"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { verifyPdf, VerificationResult } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function VerifyPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are accepted");
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
  };

  const handleVerify = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const res = await verifyPdf(file);
      setResult(res);
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  const hasUntrusted = result?.signatures?.some(
    (s) => s.intact && s.trust_status !== "VALID"
  );

  // Stamp position state — shared between preview and export
  const [stampPos, setStampPos] = useState<{x:number;y:number;w:number;h:number} | null>(null);

  return (
    <div className="flex h-full">
      {/* Left panel - Results */}
      <div className="w-[380px] shrink-0 border-r border-gray-200/60 dark:border-gray-800/60 flex flex-col overflow-y-auto">
        <div className="p-4 space-y-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Verify Signatures
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Upload a signed PDF to verify its digital signatures and integrity.
            </p>
          </div>

          {!result ? (
            <>
              {/* Upload area */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  dragOver
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                    : "border-gray-300 dark:border-gray-700 hover:border-blue-400"
                }`}
                onClick={() => document.getElementById("verify-input")?.click()}
              >
                <input
                  id="verify-input"
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                <div className="text-3xl mb-2">🔍</div>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {file ? file.name : "Drop PDF or click to browse"}
                </p>
                {file && (
                  <p className="text-[10px] text-gray-500 mt-1">
                    {(file.size / 1024).toFixed(0)} KB · Ready to verify
                  </p>
                )}
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-3">
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium">⚠️ {error}</p>
                </div>
              )}

              <button
                onClick={handleVerify}
                disabled={!file || loading}
                className="w-full btn btn-primary text-sm"
              >
                {loading ? "⏳ Verifying..." : "✅ Verify Signatures"}
              </button>
            </>
          ) : (
            <>
              {/* Verification results */}
              <div className={`rounded-xl p-3 ${
                result.is_valid
                  ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
                  : hasUntrusted
                  ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
                  : "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"
              }`}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {result.is_valid ? "✅" : hasUntrusted ? "⚠️" : "❌"}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white">
                      {result.is_valid ? "All Signatures Valid" : hasUntrusted ? "Untrusted Signatures" : "Invalid Signatures"}
                    </p>
                    <p className="text-[10px] text-gray-600 dark:text-gray-400">
                      {result.filename} · {result.signature_count} sig(s)
                    </p>
                  </div>
                </div>
              </div>

              {/* Signature cards */}
              {result.signatures.map((sig, i) => (
                <SignatureCard key={i} sig={sig} index={i} />
              ))}

              {/* Trust Store */}
              <TrustStoreSection />

              {/* Actions */}
              <div className="flex gap-2">
                <button onClick={reset} className="btn btn-outline flex-1 text-xs">🔍 Verify Another</button>
                <ExportButton file={file} result={result} hasUntrusted={hasUntrusted} stampPos={stampPos} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right panel - PDF Preview with draggable stamp */}
      <div className="flex-1 relative flex flex-col">
        {file && result ? (
          <PdfPreviewWithStamp result={result} file={file} hasUntrusted={hasUntrusted} stampPos={stampPos} setStampPos={setStampPos} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Upload a PDF to preview
          </div>
        )}
      </div>
    </div>
  );
}


function SignatureCard({ sig, index }: { sig: any; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const isValid = sig.intact && sig.trust_status === "VALID";

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold ${
          isValid ? "bg-green-500" : sig.intact ? "bg-amber-400" : "bg-red-500"
        }`}>
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
            {sig.signer?.common_name || "Unknown"}
          </p>
          <p className="text-[10px] text-gray-500 truncate">
            {sig.signer?.issuer_cn || ""}
          </p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          isValid ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
            : sig.intact ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400"
            : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400"
        }`}>
          {isValid ? "VALID" : sig.intact ? "UNTRUSTED" : "INVALID"}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-100 dark:border-gray-800">
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div>
              <p className="text-[9px] text-gray-500 uppercase">Integrity</p>
              <p className={`text-[11px] font-bold ${sig.intact ? "text-green-600" : "text-red-600"}`}>
                {sig.intact ? "Intact" : "Tampered"}
              </p>
            </div>
            <div>
              <p className="text-[9px] text-gray-500 uppercase">Trust</p>
              <p className={`text-[11px] font-bold ${
                sig.trust_status === "VALID" ? "text-green-600"
                  : sig.trust_status === "UNTRUSTED" ? "text-amber-600"
                  : "text-red-600"
              }`}>
                {sig.trust_status || "N/A"}
              </p>
            </div>
          </div>
          {sig.timestamps?.signing_time && sig.timestamps.signing_time !== "Unknown" && (
            <div>
              <p className="text-[9px] text-gray-500 uppercase">Signed</p>
              <span className="text-[10px] text-gray-600 dark:text-gray-400 font-medium">{sig.timestamps.signing_time}</span>
            </div>
          )}
          {sig.details?.reason && (
            <div><p className="text-[9px] text-gray-500 uppercase">Reason</p><p className="text-[11px] text-gray-700 dark:text-gray-300">{sig.details.reason}</p></div>
          )}
          {sig.details?.location && (
            <div><p className="text-[9px] text-gray-500 uppercase">Location</p><p className="text-[11px] text-gray-700 dark:text-gray-300">{sig.details.location}</p></div>
          )}
        </div>
      )}
    </div>
  );
}


function TrustStoreSection() {
  const [trustStore, setTrustStore] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/trust-store`).then(r => r.json()).then(setTrustStore).catch(() => {});
  }, []);

  const handleRemoveTrust = async (id: number) => {
    await fetch(`${API_BASE}/api/trust-store/${id}`, { method: "DELETE" });
    setTrustStore(trustStore.filter(c => c.id !== id));
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <button onClick={() => setShowAdd(!showAdd)} className="w-full flex items-center gap-2 p-3 text-left">
        <span>🛡️</span>
        <span className="text-xs font-bold text-gray-900 dark:text-white flex-1">Trust Store</span>
        <span className="text-[10px] text-gray-500">{trustStore.length} cert(s)</span>
        <span className="text-gray-400 text-xs">{showAdd ? "▲" : "▼"}</span>
      </button>
      {showAdd && (
        <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-800">
          {trustStore.length === 0 ? (
            <p className="text-[11px] text-gray-500 text-center py-3">No trusted certificates.</p>
          ) : (
            <div className="space-y-1.5 max-h-32 overflow-y-auto pt-2">
              {trustStore.map((cert) => (
                <div key={cert.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-2.5 py-2">
                  <span className="text-xs">🛡️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-gray-900 dark:text-white truncate">{cert.name}</p>
                    <p className="text-[9px] text-gray-500">{cert.issuer_cn}</p>
                  </div>
                  <button onClick={() => handleRemoveTrust(cert.id)} className="text-red-500 hover:text-red-700 text-[10px] font-medium">Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   PDF Preview with Draggable/Resizable Stamp
   ═══════════════════════════════════════════════════════════════════ */

function PdfPreviewWithStamp({ result, file, hasUntrusted, stampPos, setStampPos }: { result: VerificationResult; file: File | null; hasUntrusted: boolean | undefined; stampPos: {x:number;y:number;w:number;h:number}|null; setStampPos: (p:{x:number;y:number;w:number;h:number})=>void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const pageDim = result.page_dimensions;

  // Render PDF with pdfjs-dist
  useEffect(() => {
    if (!file || !canvasRef.current || !containerRef.current) return;
    let cancelled = false;

    const renderPdf = async () => {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const container = containerRef.current!;

      // Fit to container
      const containerW = container.clientWidth;
      const containerH = container.clientHeight;
      const viewport = page.getViewport({ scale: 1 });
      const scaleX = containerW / viewport.width;
      const scaleY = containerH / viewport.height;
      const fitScale = Math.min(scaleX, scaleY);

      const scaledViewport = page.getViewport({ scale: fitScale });
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      if (!cancelled) {
        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
        setCanvasScale(fitScale);
        setCanvasOffset({ x: (containerW - scaledViewport.width) / 2, y: (containerH - scaledViewport.height) / 2 });
        setRendered(true);
      }
    };

    renderPdf().catch(console.error);
    return () => { cancelled = true; };
  }, [file]);

  // Initialize stamp position — place BELOW the signature widget, in clear space
  useEffect(() => {
    if (!stampPos && result.signatures.length > 0 && pageDim) {
      const sig = result.signatures[0];
      const pos = sig.details?.position;
      if (pos) {
        const stampW = 210;
        const stampH = 80;
        // The stamp content occupies the TOP of the stamp box (y=13..66 within it)
        // Place the box so content sits BETWEEN the widget bottom and nearby text
        // Widget bottom is pos.y1. Text above starts ~pos.y1+65 (varies per PDF).
        // Place box bottom (sy) so that sy + 66 (content top) > widget bottom,
        // and sy + 66 < nearby text. Also sy >= 80 so it's visible in canvas.
        const sy = Math.max(80, pos.y1 - 15);
        // Center horizontally relative to widget, clamped to page bounds
        const sx = Math.max(5, Math.min(
          (pos.x1 + pos.x2) / 2 - stampW / 2,
          pageDim.width - stampW - 5
        ));
        setStampPos({ x: sx, y: sy, w: stampW, h: stampH });
      } else {
        // No position data — place at bottom-right
        setStampPos({ x: pageDim.width - 230, y: 80, w: 210, h: 80 });
      }
    }
  }, [result, pageDim]);

  // PDF coords → screen coords (on canvas)
  const pdfToScreen = (px: number, py: number) => {
    if (!pageDim) return { sx: 0, sy: 0 };
    return {
      sx: canvasOffset.x + px * canvasScale,
      sy: canvasOffset.y + (pageDim.height - py) * canvasScale,
    };
  };

  // Screen coords → PDF coords
  const screenToPdf = (sx: number, sy: number) => {
    if (!pageDim) return { px: 0, py: 0 };
    return {
      px: (sx - canvasOffset.x) / canvasScale,
      py: pageDim.height - (sy - canvasOffset.y) / canvasScale,
    };
  };

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    const rect = containerRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    if (stampPos) {
      const { sx, sy } = pdfToScreen(stampPos.x, stampPos.y);
      setDragOffset({ x: mouseX - sx, y: mouseY - sy });
    }
  }, [stampPos, canvasScale, canvasOffset, pageDim]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if ((!dragging && !resizing) || !stampPos || !pageDim) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (dragging) {
      const { px, py } = screenToPdf(mouseX - dragOffset.x, mouseY - dragOffset.y);
      setStampPos({ ...stampPos, x: Math.max(0, Math.min(px, pageDim.width - stampPos.w)), y: Math.max(0, Math.min(py, pageDim.height - stampPos.h)) });
    }
    if (resizing) {
      const { px, py } = screenToPdf(mouseX, mouseY);
      const newW = Math.max(120, Math.min(px - stampPos.x, pageDim.width - stampPos.x));
      const newH = Math.max(50, Math.min(py - stampPos.y, pageDim.height - stampPos.y));
      setStampPos({ ...stampPos, w: newW, h: newH });
    }
  }, [dragging, resizing, dragOffset, stampPos, canvasScale, canvasOffset, pageDim]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
    setResizing(false);
  }, []);

  useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener("mousemove", handleMouseMove as any);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove as any);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragging, resizing, handleMouseMove, handleMouseUp]);

  // Screen position of stamp
  const screenStamp = stampPos && pageDim && rendered
    ? { ...pdfToScreen(stampPos.x, stampPos.y), w: stampPos.w * canvasScale, h: stampPos.h * canvasScale }
    : null;

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 relative bg-gray-200 dark:bg-gray-800 overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* PDF rendered on canvas */}
      <canvas
        ref={canvasRef}
        className="absolute"
        style={{ left: canvasOffset.x, top: canvasOffset.y }}
      />

      {/* Draggable stamp overlay */}
      {screenStamp && (
        <div
          className={`absolute select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
          style={{
            left: `${screenStamp.sx}px`,
            top: `${screenStamp.sy}px`,
            width: `${screenStamp.w}px`,
            height: `${screenStamp.h}px`,
            zIndex: 50,
          }}
          onMouseDown={handleMouseDown}
        >
          <div className="w-full h-full bg-white border border-gray-200 shadow-lg p-2 flex flex-col justify-between">
            <div>
              <p className="text-[11px] font-bold text-gray-900 leading-tight">Signature valid</p>
              <p className="text-[9px] text-gray-600 leading-tight mt-0.5">
                Digitally signed by {result.signatures[0]?.signer?.common_name || "Unknown"}
              </p>
              {result.signatures[0]?.timestamps?.signing_time && (
                <p className="text-[8px] text-gray-500 leading-tight">
                  Date: {result.signatures[0].timestamps.signing_time}
                </p>
              )}
              {result.signatures[0]?.details?.reason && (
                <p className="text-[8px] text-gray-500 leading-tight">
                  Reason: {result.signatures[0].details.reason}
                </p>
              )}
              {result.signatures[0]?.details?.location && (
                <p className="text-[8px] text-gray-500 leading-tight">
                  Location: {result.signatures[0].details.location}
                </p>
              )}
            </div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12.5l5 5L20 6" />
              </svg>
            </div>
          </div>
          <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setResizing(true); }}>
            <svg width="12" height="12" viewBox="0 0 12 12" className="absolute bottom-0.5 right-0.5">
              <path d="M10 2L2 10M10 6L6 10M10 10L10 10" stroke="#999" strokeWidth="1.5" />
            </svg>
          </div>
        </div>
      )}

      {/* Status badge */}
      <div className="absolute top-4 right-4 z-40">
        <div className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl shadow-xl ${
          result.is_valid ? "bg-green-500/90 text-white"
            : hasUntrusted ? "bg-amber-500/90 text-white"
            : "bg-red-500/90 text-white"
        }`}>
          <div className="text-2xl font-bold">{result.is_valid ? "✓" : hasUntrusted ? "⚠" : "✗"}</div>
          <div className="text-[10px] font-bold tracking-wide">
            {result.is_valid ? "SIGNATURE VALID" : hasUntrusted ? "UNTRUSTED" : "INVALID"}
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40">
        <div className="bg-black/70 text-white text-[10px] px-3 py-1.5 rounded-full">
          Drag stamp to reposition · Drag corner to resize
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   Export Button — sends stamp position to backend
   ═══════════════════════════════════════════════════════════════════ */

function ExportButton({ file, result, hasUntrusted, stampPos }: { file: File | null; result: VerificationResult | null; hasUntrusted: boolean | undefined; stampPos: {x:number;y:number;w:number;h:number}|null }) {
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<any>(null);

  const handleExport = async () => {
    if (!file) return;
    setExporting(true);
    setExportResult(null); // Clear previous result so we re-export
    try {
      const form = new FormData();
      form.append("file", file);
      // Send CURRENT stamp position to backend — always fresh
      let url = `${API_BASE}/api/verify/stamp`;
      if (stampPos) {
        url += `?stamp_x=${stampPos.x}&stamp_y=${stampPos.y}&stamp_w=${stampPos.w}&stamp_h=${stampPos.h}`;
      }
      const res = await fetch(url, { method: "POST", body: form });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Export failed"); }
      setExportResult(await res.json());
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleDownload = async () => {
    if (!exportResult) return;
    const res = await fetch(`${API_BASE}${exportResult.download_url}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportResult.stamped_filename || "verified.pdf";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex gap-2 flex-1">
      <button onClick={handleExport} disabled={exporting || !file} className="btn btn-primary flex-1 text-xs">
        {exporting ? "⏳ Exporting..." : exportResult ? "🔄 Re-Export" : "📄 Export"}
      </button>
      {exportResult && (
        <button onClick={handleDownload} className="btn btn-outline flex-1 text-xs">
          ⬇️ Download
        </button>
      )}
    </div>
  );
}
