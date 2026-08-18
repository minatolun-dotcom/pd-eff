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
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
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
        // Draw existing rectangle if any
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
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.fillStyle = "rgba(37, 99, 235, 0.1)";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    // Label
    ctx.fillStyle = "#2563eb";
    ctx.font = "12px system-ui";
    ctx.fillText("Signature", rect.x + 4, rect.y + 16);
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

    // Redraw canvas with preview
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Re-render the page first
        pdf.getPage(pageNum).then((page: any) => {
          const viewport = page.getViewport({ scale });
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          page.render({ canvasContext: ctx, viewport }).promise.then(() => {
            // Draw preview rectangle
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

    // Minimum size check
    if (width > 20 && height > 10) {
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
  };

  const handleSign = () => {
    if (rectangle) {
      onSign(rectangle, pageNum);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-xl">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-3">📄</div>
          <p className="text-gray-500">Loading PDF...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-t-xl px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPageNum(Math.max(1, pageNum - 1))}
            disabled={pageNum <= 1}
            className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            ←
          </button>
          <span className="text-sm text-gray-600">
            Page {pageNum} / {totalPages}
          </span>
          <button
            onClick={() => setPageNum(Math.min(totalPages, pageNum + 1))}
            disabled={pageNum >= totalPages}
            className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            →
          </button>
        </div>
        <div className="flex items-center gap-2">
          {rectangle && (
            <button
              onClick={handleClear}
              className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
            >
              Clear selection
            </button>
          )}
          <button
            onClick={() => setScale(Math.max(0.5, scale - 0.25))}
            className="px-2 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
          >
            −
          </button>
          <span className="text-xs text-gray-500">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale(Math.min(3, scale + 0.25))}
            className="px-2 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
          >
            +
          </button>
        </div>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="relative bg-gray-100 border-x border-gray-200 overflow-auto flex justify-center"
        style={{ maxHeight: "600px" }}
      >
        <canvas
          ref={canvasRef}
          className={`shadow-lg ${signing ? "cursor-wait" : "cursor-crosshair"}`}
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
      </div>

      {/* Sign controls */}
      <div className="bg-white border border-t-0 border-gray-200 rounded-b-xl px-4 py-3">
        {!rectangle ? (
          <p className="text-sm text-gray-500 text-center">
            ✍️ Draw a rectangle on the PDF where you want to place your signature
          </p>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-green-700">
              ✅ Signature area selected ({Math.round(rectangle.width)}×{Math.round(rectangle.height)} px)
            </p>
            <button
              onClick={handleSign}
              disabled={signing}
              className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition"
            >
              {signing ? "⏳ Signing..." : "🔐 Sign here"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
