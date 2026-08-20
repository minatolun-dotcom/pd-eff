"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PdfSignerProps {
  file: File;
  onSign: (rectangle: Rectangle, pageNumber: number) => void;
  signing?: boolean;
}

export default function PdfSigner({ file, onSign, signing }: PdfSignerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(1.5);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [rectangle, setRectangle] = useState<Rectangle | null>(null);
  const [previewRect, setPreviewRect] = useState<Rectangle | null>(null);

  // Load PDF
  useEffect(() => {
    let cancelled = false;
    async function loadPdf() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;
        if (cancelled) return;
        setPdf(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        setLoading(false);
      } catch (err: any) {
        console.error("Failed to load PDF:", err);
        setLoading(false);
      }
    }
    loadPdf();
    return () => { cancelled = true; };
  }, [file]);

  // Render page
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    async function renderPage() {
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current!;
        const context = canvas.getContext("2d")!;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;
        if (rectangle) {
          drawRectangle(context, rectangle);
        }
      } catch (err) {
        console.error("Failed to render page:", err);
      }
    }
    renderPage();
  }, [pdf, pageNum, scale, rectangle]);

  const drawRectangle = (ctx: CanvasRenderingContext2D, rect: Rectangle) => {
    // Shadow
    ctx.shadowColor = "rgba(37, 99, 235, 0.3)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;

    // Fill
    ctx.fillStyle = "rgba(37, 99, 235, 0.08)";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    // Border
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.setLineDash([]);

    // Corner markers
    const cornerSize = 8;
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 3;
    const corners = [
      [rect.x, rect.y],
      [rect.x + rect.width, rect.y],
      [rect.x, rect.y + rect.height],
      [rect.x + rect.width, rect.y + rect.height],
    ];
    for (const [cx, cy] of corners) {
      ctx.beginPath();
      ctx.arc(cx, cy, cornerSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#2563eb";
      ctx.fill();
    }

    // Label
    ctx.fillStyle = "#2563eb";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.fillText("✍️ Signature", rect.x + 6, rect.y + 16);
  };

  const getCanvasCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (signing) return;
    const coords = getCanvasCoords(e);
    setIsDrawing(true);
    setStartPoint(coords);
    setRectangle(null);
    setPreviewRect(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !startPoint) return;
    const coords = getCanvasCoords(e);
    const x = Math.min(startPoint.x, coords.x);
    const y = Math.min(startPoint.y, coords.y);
    const width = Math.abs(coords.x - startPoint.x);
    const height = Math.abs(coords.y - startPoint.y);
    setPreviewRect({ x, y, width, height });

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        pdf.getPage(pageNum).then((page: any) => {
          const viewport = page.getViewport({ scale });
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          page.render({ canvasContext: ctx, viewport }).promise.then(() => {
            drawRectangle(ctx, { x, y, width, height });
          });
        });
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDrawing || !startPoint) return;
    const coords = getCanvasCoords(e);
    const x = Math.min(startPoint.x, coords.x);
    const y = Math.min(startPoint.y, coords.y);
    const width = Math.abs(coords.x - startPoint.x);
    const height = Math.abs(coords.y - startPoint.y);

    if (width > 30 && height > 15) {
      setRectangle({ x, y, width, height });
      setPreviewRect(null);
    } else {
      setRectangle(null);
      setPreviewRect(null);
    }
    setIsDrawing(false);
    setStartPoint(null);
  };

  const handleClear = () => {
    setRectangle(null);
    setPreviewRect(null);
    // Re-render page without rectangle
    if (pdf && canvasRef.current) {
      pdf.getPage(pageNum).then((page: any) => {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        const viewport = page.getViewport({ scale });
        page.render({ canvasContext: ctx, viewport });
      });
    }
  };

  const handleSign = () => {
    if (rectangle) {
      onSign(rectangle, pageNum);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 dark:bg-gray-800">
        <div className="text-center animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center text-3xl mx-auto mb-4 animate-pulse">
            📄
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">Loading PDF...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2.5">
        {/* Left: Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPageNum(Math.max(1, pageNum - 1))}
            disabled={pageNum <= 1}
            className="w-8 h-8 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm font-bold"
          >
            ‹
          </button>
          <div className="flex items-center gap-1 text-sm">
            <span className="font-semibold text-gray-900 dark:text-white">{pageNum}</span>
            <span className="text-gray-500 dark:text-gray-400">/</span>
            <span className="text-gray-500 dark:text-gray-400">{totalPages}</span>
          </div>
          <button
            onClick={() => setPageNum(Math.min(totalPages, pageNum + 1))}
            disabled={pageNum >= totalPages}
            className="w-8 h-8 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm font-bold"
          >
            ›
          </button>
        </div>

        {/* Center: Status */}
        <div className="hidden sm:flex items-center gap-2">
          {rectangle ? (
            <span className="badge badge-success animate-scaleIn">
              ✓ Area Selected
            </span>
          ) : (
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              Draw a rectangle to place signature
            </span>
          )}
        </div>

        {/* Right: Zoom */}
        <div className="flex items-center gap-1.5">
          {rectangle && (
            <button
              onClick={handleClear}
              className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg font-medium transition-all mr-1"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setScale(Math.max(0.5, scale - 0.25))}
            className="w-7 h-7 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all text-xs"
          >
            −
          </button>            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium w-10 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale(Math.min(3, scale + 0.25))}
            className="w-7 h-7 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all text-xs"
          >
            +
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative bg-gray-100 dark:bg-gray-800 overflow-auto flex justify-center"
        style={{ maxHeight: "600px" }}
      >
        <canvas
          ref={canvasRef}
          className={`shadow-lg transition-shadow hover:shadow-xl ${
            signing ? "cursor-wait opacity-60" : "cursor-crosshair"
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            if (isDrawing) {
              setIsDrawing(false);
              setStartPoint(null);
              setPreviewRect(null);
            }
          }}
        />
        {/* Overlay hint */}
        {!rectangle && !isDrawing && !signing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white dark:bg-gray-900/90 backdrop-blur-sm rounded-2xl px-5 py-3 shadow-lg border border-gray-200 dark:border-gray-700/50 animate-fadeIn">
              <p className="text-sm text-gray-600 dark:text-gray-400 font-medium flex items-center gap-2">
                <span className="text-lg">✍️</span>
                Click and drag to draw signature area
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom: Sign controls */}
      <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-4 py-3.5">
        {!rectangle ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center font-medium">
            Draw a rectangle on the PDF to place your signature
          </p>
        ) : (
          <div className="flex items-center justify-between animate-slideUp">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center text-sm">
                ✓
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Area Selected
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {Math.round(rectangle.width)} × {Math.round(rectangle.height)} px · Page {pageNum}
                </p>
              </div>
            </div>
            <button
              onClick={handleSign}
              disabled={signing}
              className="btn btn-primary"
            >
              {signing ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Signing...
                </>
              ) : (
                "🔐 Sign here"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
