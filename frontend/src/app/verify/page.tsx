"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { verifyPdf, VerificationResult } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function VerifyPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are accepted");
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
  };

  const handleVerify = async (f?: File) => {
    const target = f || file;
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const res = await verifyPdf(target);
      setResult(res);
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  // Auto-verify when file is selected
  useEffect(() => {
    if (file && !result && !loading) {
      handleVerify(file);
    }
  }, [file]);

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  const hasUntrusted = result ? result.signatures?.some(
    (s) => s.intact && s.trust_status !== "VALID"
  ) : undefined;

  // Stamp position state
  const [stampPos, setStampPos] = useState<{x:number;y:number;w:number;h:number} | null>(null);

  // ─── Upload Screen (no file selected) ────────────────────────
  if (!file) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="w-full max-w-2xl animate-fadeIn">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Verify a PDF Document
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-base">
              Upload a signed PDF to verify its digital signatures and integrity.
            </p>
          </div>

          <div
            className={`card p-12 transition-all duration-300 ${
              isDragging ? "active border-blue-400 bg-blue-50 dark:bg-blue-900/20" : ""
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            <label className="flex flex-col items-center justify-center w-full h-64 cursor-pointer group">
              <div className="relative mb-5">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-green-50 dark:from-green-900/20 to-emerald-100 dark:to-emerald-900/20 flex items-center justify-center text-4xl group-hover:scale-110 transition-transform duration-300">
                  ✅
                </div>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl bg-green-500 text-white flex items-center justify-center text-sm shadow-lg shadow-green-500/30 group-hover:rotate-90 transition-transform duration-300">
                  +
                </div>
              </div>
              <p className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
                {isDragging ? "Drop your PDF here" : "Drop a signed PDF here or click to upload"}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                PDF files up to 50MB
              </p>
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          </div>

          {error && (
            <div className="mt-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">⚠️ {error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Loading Screen ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-3xl mx-auto mb-4 animate-pulse">
            🔍
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Verifying Signatures...</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{file.name}</p>
        </div>
      </div>
    );
  }

  // ─── Verified — side-by-side layout ──────────────────────────
  if (!result) return null;

  return (
    <div className="h-full grid" style={{ gridTemplateColumns: '1fr 340px' }}>
      {/* ─── Left: PDF Preview (big) ────────────────── */}
      <div className="relative flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-900">
        {result && (
          <PdfPreviewWithStamp result={result} file={file} hasUntrusted={hasUntrusted} stampPos={stampPos} setStampPos={setStampPos} />
        )}
      </div>

      {/* ─── Right: Cards ──────────────────────────── */}
      <div className="border-l border-gray-200/60 dark:border-gray-800/60 overflow-y-auto bg-white dark:bg-gray-950">
        <div className="p-5 space-y-4">

          {/* File info */}
          <div className="flex items-center gap-3 bg-green-50 dark:bg-green-900/15 border border-green-200 dark:border-green-800/60 rounded-xl px-4 py-2.5">
            <span className="text-lg">✅</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-green-900 dark:text-green-300 text-sm truncate">{file.name}</p>
              <p className="text-green-600 dark:text-green-400 text-xs">{(file.size / 1024).toFixed(0)} KB · Verified</p>
            </div>
            <button onClick={reset} className="text-green-600 hover:text-green-800 text-xs font-medium">
              Change
            </button>
          </div>

          {/* Status banner */}
          <div className={`rounded-xl p-3 ${
            result!.is_valid
              ? "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
              : hasUntrusted
              ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
              : "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"
          }`}>
            <div className="flex items-center gap-2">
              <span className="text-lg">
                {result!.is_valid ? "✅" : hasUntrusted ? "⚠️" : "❌"}
              </span>
              <div>
                <p className="text-xs font-bold text-gray-900 dark:text-white">
                  {result!.is_valid ? "All Signatures Valid" : hasUntrusted ? "Untrusted Signatures" : "Invalid Signatures"}
                </p>
                <p className="text-[10px] text-gray-600 dark:text-gray-400">
                  {result!.signature_count} signature(s) verified
                </p>
              </div>
            </div>
          </div>

          {/* Signature cards */}
          {result!.signatures.map((sig, i) => (
            <SignatureCard key={i} sig={sig} index={i} />
          ))}

          {/* Trust Store */}
          <TrustStoreSection />

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={reset} className="btn btn-outline flex-1 text-xs">
              🔍 Verify Another
            </button>
            <ExportButton file={file} result={result} hasUntrusted={hasUntrusted} stampPos={stampPos} />
          </div>

        </div>
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
          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
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
              <p className="text-[9px] text-gray-500 dark:text-gray-400 uppercase">Integrity</p>
              <p className={`text-[11px] font-bold ${sig.intact ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {sig.intact ? "Intact" : "Tampered"}
              </p>
            </div>
            <div>
              <p className="text-[9px] text-gray-500 dark:text-gray-400 uppercase">Trust</p>
              <p className={`text-[11px] font-bold ${
                sig.trust_status === "VALID" ? "text-green-600 dark:text-green-400"
                  : sig.trust_status === "UNTRUSTED" ? "text-amber-600 dark:text-amber-400"
                  : "text-red-600 dark:text-red-400"
              }`}>
                {sig.trust_status || "N/A"}
              </p>
            </div>
          </div>
          {sig.timestamps?.signing_time && sig.timestamps.signing_time !== "Unknown" && (
            <div>
              <p className="text-[9px] text-gray-500 dark:text-gray-400 uppercase">Signed</p>
              <span className="text-[10px] text-gray-700 dark:text-gray-300 font-medium">{sig.timestamps.signing_time}</span>
            </div>
          )}
          {sig.details?.reason && (
            <div>
              <p className="text-[9px] text-gray-500 dark:text-gray-400 uppercase">Reason</p>
              <p className="text-[11px] text-gray-700 dark:text-gray-300">{sig.details.reason}</p>
            </div>
          )}
          {sig.details?.location && (
            <div>
              <p className="text-[9px] text-gray-500 dark:text-gray-400 uppercase">Location</p>
              <p className="text-[11px] text-gray-700 dark:text-gray-300">{sig.details.location}</p>
            </div>
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
        <span className="text-[10px] text-gray-500 dark:text-gray-400">{trustStore.length} cert(s)</span>
        <span className="text-gray-500 dark:text-gray-400 text-xs">{showAdd ? "▲" : "▼"}</span>
      </button>
      {showAdd && (
        <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-800">
          {trustStore.length === 0 ? (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center py-3">No trusted certificates.</p>
          ) : (
            <div className="space-y-1.5 max-h-32 overflow-y-auto pt-2">
              {trustStore.map((cert) => (
                <div key={cert.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-2.5 py-2">
                  <span className="text-xs">🛡️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-gray-900 dark:text-white truncate">{cert.name}</p>
                    <p className="text-[9px] text-gray-500 dark:text-gray-400">{cert.issuer_cn}</p>
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  // wrapperOffset is now computed from zoom (center-based), not from cursor position
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const pageDim = result.page_dimensions;
  const pdfDocRef = useRef<any>(null);
  const pdfPageRef = useRef<any>(null);
  const renderTimerRef = useRef<any>(null);

  // Load PDF document (cached)
  useEffect(() => {
    if (!file) return;
    setPdfLoaded(false);
    let cancelled = false;
    const load = async () => {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      if (!cancelled) {
        pdfDocRef.current = pdf;
        pdfPageRef.current = await pdf.getPage(1);
        setPdfLoaded(true);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [file]);

  // Render PDF at base scale (fit-to-page), CSS transform handles zoom
  const renderPage = useCallback(async () => {
    if (!canvasRef.current || !containerRef.current || !pdfPageRef.current) return;
    const page = pdfPageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const container = containerRef.current;

    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const viewport1 = page.getViewport({ scale: 1 });
    const fitScale = Math.min(containerW / viewport1.width, containerH / viewport1.height);

    // Render at fitScale only — CSS transform handles zoom
    const scaledViewport = page.getViewport({ scale: fitScale });
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
    setCanvasScale(fitScale);
    setCanvasOffset({ x: (containerW - scaledViewport.width) / 2, y: (containerH - scaledViewport.height) / 2 });
    setRendered(true);
  }, [pdfLoaded]);

  // Render once PDF is loaded
  useEffect(() => {
    if (pdfLoaded) renderPage();
  }, [pdfLoaded, renderPage]);

  // Re-render on window resize
  useEffect(() => {
    if (!pdfLoaded) return;
    const handleResize = () => renderPage();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [pdfLoaded, renderPage]);



  // Scroll wheel zoom — zoom toward center
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(prev => {
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        return Math.max(1, Math.min(5, +(prev + delta).toFixed(2)));
      });
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  // After verification, paint over the old "Signature Not Verified" widget on canvas
  useEffect(() => {
    if (!rendered || !canvasRef.current || !result || !pageDim) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sig = result.signatures?.[0];
    const pos = sig?.details?.position;
    if (!pos) return;

    const wx = pos.x1;
    const ww = pos.x2 - pos.x1;
    const wh = pos.y2 - pos.y1;

    const cx = wx * canvasScale;
    const cy = (pageDim.height - pos.y2) * canvasScale;
    const cw = ww * canvasScale;
    const ch = wh * canvasScale;

    // Just white-out the old widget — the draggable HTML overlay shows the verified stamp
    ctx.fillStyle = "white";
    ctx.fillRect(cx - 2, cy - 2, cw + 4, ch + 4);

  }, [rendered, result, pageDim, canvasScale]);

  // Initialize stamp position
  useEffect(() => {
    if (!stampPos && result.signatures.length > 0 && pageDim) {
      const sig = result.signatures[0];
      const pos = sig.details?.position;
      if (pos) {
        const stampW = 210;
        const stampH = 80;
        const sy = Math.max(80, pos.y1 - 15);
        const sx = Math.max(5, Math.min(
          (pos.x1 + pos.x2) / 2 - stampW / 2,
          pageDim.width - stampW - 5
        ));
        setStampPos({ x: sx, y: sy, w: stampW, h: stampH });
      } else {
        setStampPos({ x: pageDim.width - 230, y: 80, w: 210, h: 80 });
      }
    }
  }, [result, pageDim]);

  // Effective scale = canvas scale × CSS zoom
  const effectiveScale = canvasScale * zoom;

  // PDF coords → screen coords (top-left of stamp)
  const pdfToScreen = (px: number, py: number) => {
    if (!pageDim) return { sx: 0, sy: 0 };
    return {
      sx: canvasOffset.x + px * effectiveScale,
      sy: canvasOffset.y + (pageDim.height - py) * effectiveScale,
    };
  };

  // Center-based wrapper offset: keeps PDF centered at any zoom level
  const centerWrapperOffset = (() => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    return {
      x: canvas.width * (1 - zoom) / 2,
      y: canvas.height * (1 - zoom) / 2,
    };
  })();

  const screenToPdfTop = (sx: number, sy: number) => {
    if (!pageDim) return { px: 0, pdfTopY: 0 };
    return {
      px: (sx - canvasOffset.x - centerWrapperOffset.x) / effectiveScale,
      pdfTopY: pageDim.height - (sy - canvasOffset.y - centerWrapperOffset.y) / effectiveScale,
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
    if (stampPos && pageDim) {
      const topSy = canvasOffset.y + centerWrapperOffset.y + (pageDim.height - stampPos.y - stampPos.h) * effectiveScale;
      const leftSx = canvasOffset.x + centerWrapperOffset.x + stampPos.x * effectiveScale;
      setDragOffset({ x: mouseX - leftSx, y: mouseY - topSy });
    }
  }, [stampPos, effectiveScale, canvasOffset, centerWrapperOffset, pageDim]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if ((!dragging && !resizing) || !stampPos || !pageDim) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (dragging) {
      const { px, pdfTopY } = screenToPdfTop(mouseX - dragOffset.x, mouseY - dragOffset.y);
      const pdfBottomY = pdfTopY - stampPos.h;
      setStampPos({ ...stampPos, x: Math.max(0, Math.min(px, pageDim.width - stampPos.w)), y: Math.max(0, Math.min(pdfBottomY, pageDim.height - stampPos.h)) });
    }
    if (resizing) {
      const { px, pdfTopY } = screenToPdfTop(mouseX, mouseY);
      const pdfBottomY = pdfTopY;
      const newW = Math.max(120, Math.min(px - stampPos.x, pageDim.width - stampPos.x));
      const newH = Math.max(50, Math.min(pdfBottomY - stampPos.y, pageDim.height - stampPos.y));
      setStampPos({ ...stampPos, w: newW, h: newH });
    }
  }, [dragging, resizing, dragOffset, stampPos, effectiveScale, canvasOffset, centerWrapperOffset, pageDim]);

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

  // Screen position of stamp (top-left) — account for CSS transform zoom
  const screenStamp = stampPos && pageDim && rendered
    ? {
        sx: canvasOffset.x + centerWrapperOffset.x + stampPos.x * effectiveScale,
        sy: canvasOffset.y + centerWrapperOffset.y + (pageDim.height - stampPos.y - stampPos.h) * effectiveScale,
        w: stampPos.w * effectiveScale,
        h: stampPos.h * effectiveScale,
      }
    : null;

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 relative bg-gray-200 dark:bg-gray-800 overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Canvas wrapper — CSS transform handles zoom smoothly */}
      <div
        ref={wrapperRef}
        className="absolute"
        style={{
          left: canvasOffset.x + centerWrapperOffset.x,
          top: canvasOffset.y + centerWrapperOffset.y,
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: 'block' }}
        />
      </div>

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
          <div className="w-full h-full bg-white border-l-[3px] border-l-green-500 border-t border-r border-b border-gray-200 shadow-md p-2.5 flex flex-col justify-center relative">
            <div className="pr-8">
              <p className="text-[12px] font-bold text-gray-900 leading-tight mb-0.5">Signature valid</p>
              <p className="text-[9px] text-gray-700 leading-tight">
                Digitally signed by {result.signatures[0]?.signer?.common_name || "Unknown"}
              </p>
              {result.signatures[0]?.timestamps?.signing_time && (
                <p className="text-[8px] text-gray-500 leading-tight mt-0.5">
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
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7" />
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

      {/* Zoom controls */}
      <div className="absolute top-4 left-4 z-40 flex items-center gap-1 bg-white/90 dark:bg-gray-800/90 rounded-lg shadow-lg px-2 py-1">
        <button
          onClick={() => setZoom(z => Math.max(1, z - 0.2))}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-bold"
          title="Zoom out"
        >
          −
        </button>
        <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(z => Math.min(5, z + 0.2))}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-bold"
          title="Zoom in"
        >
          +
        </button>
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
        <button
          onClick={() => setZoom(1)}
          className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium"
          title="Fit to page"
        >
          Fit
        </button>
      </div>

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
   Export Button — auto-downloads, re-exports on each click
   ═══════════════════════════════════════════════════════════════════ */

function ExportButton({ file, result, hasUntrusted, stampPos }: { file: File | null; result: VerificationResult | null; hasUntrusted: boolean | undefined; stampPos: {x:number;y:number;w:number;h:number}|null }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!file) return;
    setExporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      let url = `${API_BASE}/api/verify/stamp`;
      if (stampPos) {
        url += `?stamp_x=${stampPos.x}&stamp_y=${stampPos.y}&stamp_w=${stampPos.w}&stamp_h=${stampPos.h}`;
      }
      const res = await fetch(url, { method: "POST", body: form });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Export failed"); }
      const data = await res.json();

      // Auto-download
      const dlRes = await fetch(`${API_BASE}${data.download_url}`);
      const blob = await dlRes.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = data.stamped_filename || "verified.pdf";
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button onClick={handleExport} disabled={exporting || !file} className="btn btn-primary flex-1 text-xs">
      {exporting ? "⏳ Exporting..." : "📄 Export Verified PDF"}
    </button>
  );
}
