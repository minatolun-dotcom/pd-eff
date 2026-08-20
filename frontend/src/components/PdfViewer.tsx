"use client";

import { useEffect, useRef, useState } from "react";

interface PdfViewerProps {
  url: string;
  className?: string;
}

export default function PdfViewer({ url, className = "" }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      try {
        // Dynamic import to avoid SSR issues
        const pdfjsLib = await import("pdfjs-dist");

        // Set worker source
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

        const loadingTask = pdfjsLib.getDocument(url);
        const pdfDoc = await loadingTask.promise;

        if (cancelled) return;

        setPdf(pdfDoc);
        setTotalPages(pdfDoc.numPages);
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to load PDF");
          setLoading(false);
        }
      }
    }

    loadPdf();
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    async function renderPage() {
      try {
        const page = await pdf.getPage(pageNum);
        const scale = 1.5;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current!;
        const context = canvas.getContext("2d")!;
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          viewport,
        }).promise;
      } catch (err) {
        console.error("Failed to render page:", err);
      }
    }

    renderPage();
  }, [pdf, pageNum]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-xl ${className}`}>
        <div className="text-center p-8">
          <div className="animate-spin text-4xl mb-3">📄</div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-red-50 rounded-xl ${className}`}>
        <div className="text-center p-8">
          <div className="text-4xl mb-3">❌</div>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col bg-gray-100 rounded-xl overflow-hidden ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPageNum(Math.max(1, pageNum - 1))}
            disabled={pageNum <= 1}
            aria-label="Previous page"
            className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[100px] text-center">
            Page {pageNum} of {totalPages}
          </span>
          <button
            onClick={() => setPageNum(Math.min(totalPages, pageNum + 1))}
            disabled={pageNum >= totalPages}
            aria-label="Next page"
            className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded"
        >
          Open in new tab ↗
        </a>
      </div>

      {/* Canvas */}
      <div className="overflow-auto flex-1 p-4 flex justify-center">
        <canvas ref={canvasRef} className="shadow-lg" />
      </div>
    </div>
  );
}
