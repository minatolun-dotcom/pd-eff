"use client";

import { useState, useCallback } from "react";
import {
  verifyPdf,
  VerificationResult,
  SignatureDetail,
  listTrustStore,
  TrustedCert,
  extractAndTrust,
  extractAndTrustBulk,
  removeFromTrustStore,
  loadCaBundle,
} from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type View = "upload" | "result";

export default function VerifyPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [view, setView] = useState<View>("upload");

  const [trustStore, setTrustStore] = useState<TrustedCert[]>([]);
  const [showTrustStore, setShowTrustStore] = useState(false);
  const [trusting, setTrusting] = useState<number | null>(null);
  const [trustMessage, setTrustMessage] = useState("");
  const [bulkTrusting, setBulkTrusting] = useState(false);
  const [loadingBundle, setLoadingBundle] = useState(false);

  const handleFileSelect = useCallback((f: File) => {
    if (f && f.type === "application/pdf") {
      setFile(f);
      setResult(null);
      setError("");
      setView("upload");
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileSelect(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  const handleVerify = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const res = await verifyPdf(file);
      setResult(res);
      setView("result");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTrustCertificate = async (sigIndex: number, cert: SignatureDetail) => {
    if (!file) return;
    setTrusting(sigIndex);
    setTrustMessage("");
    try {
      const res = await extractAndTrust(file, sigIndex, cert.signer.common_name || `Signer ${sigIndex + 1}`, "signing");
      setTrustMessage(`✓ Trusted: ${res.name}`);
      const store = await listTrustStore();
      setTrustStore(store);
      const newResult = await verifyPdf(file);
      setResult(newResult);
    } catch (err: any) {
      setTrustMessage(`⚠ ${err.message}`);
    } finally {
      setTrusting(null);
    }
  };

  const handleRemoveTrust = async (id: string) => {
    try {
      await removeFromTrustStore(id);
      const store = await listTrustStore();
      setTrustStore(store);
      if (file) { const newResult = await verifyPdf(file); setResult(newResult); }
    } catch (err: any) {
      setTrustMessage(`⚠ ${err.message}`);
    }
  };

  const handleBulkTrust = async () => {
    if (!file) return;
    setBulkTrusting(true);
    setTrustMessage("");
    try {
      const res = await extractAndTrustBulk(file);
      setTrustMessage(`✓ ${res.message}`);
      const store = await listTrustStore();
      setTrustStore(store);
      if (file) { const newResult = await verifyPdf(file); setResult(newResult); }
    } catch (err: any) {
      setTrustMessage(`⚠ ${err.message}`);
    } finally {
      setBulkTrusting(false);
    }
  };

  const handleLoadCaBundle = async (bundle: string) => {
    setLoadingBundle(true);
    setTrustMessage("");
    try {
      const res = await loadCaBundle(bundle);
      setTrustMessage(`✓ ${res.message}`);
      const store = await listTrustStore();
      setTrustStore(store);
      if (file) { const newResult = await verifyPdf(file); setResult(newResult); }
    } catch (err: any) {
      setTrustMessage(`⚠ ${err.message}`);
    } finally {
      setLoadingBundle(false);
    }
  };

  const loadTrustStore = async () => {
    const store = await listTrustStore();
    setTrustStore(store);
    setShowTrustStore(!showTrustStore);
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError("");
    setView("upload");
    setTrustMessage("");
  };

  const hasUntrusted = result?.signatures?.some((s) => s.intact && s.trust_status !== "VALID");

  // ─── Upload Screen ───────────────────────────────────────────
  if (!result) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="w-full max-w-2xl animate-fadeIn">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Verify Signatures</h1>
            <p className="text-gray-500 dark:text-gray-400 text-base">
              Upload a signed PDF to verify its digital signatures and integrity.
            </p>
          </div>

          <div
            className={`card p-10 transition-all duration-300 ${
              isDragging ? "active border-blue-400 bg-blue-50/50 dark:bg-blue-900/20" : ""
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <label className="flex flex-col items-center justify-center w-full cursor-pointer group">
              <div className="relative mb-5">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20 flex items-center justify-center text-4xl group-hover:scale-110 transition-transform duration-300">
                  🔍
                </div>
                {file && (
                  <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-sm shadow-lg animate-bounceIn">✓</div>
                )}
              </div>
              <p className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
                {file ? file.name : isDragging ? "Drop your PDF here" : "Drop a signed PDF here or click to upload"}
              </p>
              {file ? (
                <p className="text-sm text-gray-400">{(file.size / 1024).toFixed(0)} KB · Ready to verify</p>
              ) : (
                <p className="text-sm text-gray-400">PDF files up to 50MB</p>
              )}
              <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
            </label>
          </div>

          {file && (
            <div className="flex gap-3 mt-4">
              <button onClick={handleVerify} disabled={loading} className="btn btn-success btn-lg flex-1">
                {loading ? (<>⏳ Verifying...</>) : "✅ Verify Signatures"}
              </button>
              <button onClick={reset} className="btn btn-outline btn-lg">Clear</button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-2xl p-5 text-red-700 text-sm animate-slideUp flex items-start gap-3 mt-4">
              <span className="text-lg">⚠️</span>
              <div><p className="font-semibold mb-1">Verification Failed</p><p>{error}</p></div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Results Screen (side-by-side on desktop) ────────────────
  return (
    <div className="h-full flex">
      {/* ─── Left Panel: Results ──────────────────────── */}
      <div className="w-[420px] shrink-0 border-r border-gray-200/60 dark:border-gray-800/60 overflow-y-auto bg-white dark:bg-gray-950">
        <div className="p-5 space-y-4">
          {/* Status banner */}
          <div className={`rounded-xl p-4 text-center ${
            result.is_valid
              ? "bg-green-50 dark:bg-green-900/15"
              : hasUntrusted
              ? "bg-amber-50 dark:bg-amber-900/15"
              : "bg-red-50 dark:bg-red-900/15"
          }`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl mx-auto mb-2 ${
              result.is_valid ? "bg-green-500 text-white" : hasUntrusted ? "bg-amber-400 text-white" : "bg-red-500 text-white"
            }`}>
              {result.is_valid ? "✅" : hasUntrusted ? "⚠️" : "❌"}
            </div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">
              {result.is_valid ? "All Signatures Valid" : hasUntrusted ? "Signatures Valid but Untrusted" : "Signatures Invalid"}
            </h2>
          </div>

          {trustMessage && (
            <div className="bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-blue-700 dark:text-blue-400 text-xs animate-slideUp">
              {trustMessage}
            </div>
          )}

          {/* File info */}
          <div className="card p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm">📄</span>
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{result.filename}</span>
            </div>
            <span className="badge badge-info text-[10px] shrink-0">{result.signature_count} sig(s)</span>
          </div>

          {/* Signatures */}
          {result.signatures.map((sig, i) => {
            const isUntrusted = sig.intact && sig.trust_status !== "VALID";
            return (
              <div key={i} className={`card p-4 border-l-4 ${
                sig.intact && sig.trust_status === "VALID" ? "border-l-green-500"
                  : isUntrusted ? "border-l-amber-500" : "border-l-red-500"
              }`}>

                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold ${
                      sig.intact && sig.trust_status === "VALID" ? "bg-green-500"
                        : isUntrusted ? "bg-amber-400" : "bg-red-500"
                    }`}>
                      {i + 1}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white text-sm">
                        {sig.signer.common_name || "Unknown Signer"}
                      </p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">
                        {sig.signer.issuer_cn || ""}
                      </p>
                    </div>
                  </div>
                  <span className={`badge text-[10px] ${
                    sig.intact && sig.trust_status === "VALID" ? "badge-success"
                      : isUntrusted ? "badge-warning" : "badge-danger"
                  }`}>
                    {sig.intact && sig.trust_status === "VALID" ? "✓ VALID" : isUntrusted ? "⚠ UNTRUSTED" : "✗ INVALID"}
                  </span>
                </div>

                {/* Compact stats */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-2.5 py-1.5">
                    <span className="text-[9px] text-gray-400 font-medium uppercase">Integrity</span>
                    <p className={`text-xs font-semibold ${sig.intact ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {sig.intact ? "Intact" : "Tampered"}
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-2.5 py-1.5">
                    <span className="text-[9px] text-gray-400 font-medium uppercase">Trust</span>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">
                      {isUntrusted ? "Untrusted" : sig.trust_status}
                    </p>
                  </div>
                </div>

                {/* Cert chain */}
                {sig.certificates && sig.certificates.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Chain ({sig.certificates.length})</p>
                    <div className="space-y-1">
                      {sig.certificates.map((c, ci) => (
                        <div key={ci} className="flex items-center gap-1.5 text-[11px] bg-gray-50 dark:bg-gray-800 rounded-lg px-2.5 py-1.5">
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                            c.is_self_signed ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                              : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          }`}>
                            {ci + 1}
                          </span>
                          <span className="font-medium text-gray-700 dark:text-gray-300 truncate flex-1">
                            {c.subject_cn || "Unknown"}
                          </span>
                          {c.is_self_signed && <span className="text-[8px] text-purple-600 dark:text-purple-400">ROOT</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Trust action */}
                {isUntrusted && (
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3">
                    <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 mb-2">🔒 Not in trust store</p>
                    <div className="flex gap-1.5">
                      <button onClick={handleBulkTrust} disabled={bulkTrusting} className="btn btn-outline btn-sm text-[10px] px-2 py-1">
                        {bulkTrusting ? "⏳" : "🔗 Trust Chain"}
                      </button>
                      <button onClick={() => handleTrustCertificate(i, sig)} disabled={trusting === i} className="btn btn-primary btn-sm text-[10px] px-2 py-1">
                        {trusting === i ? "⏳" : "🔐 Trust Signer"}
                      </button>
                    </div>
                  </div>
                )}

                {sig.timestamps?.signing_time && sig.timestamps.signing_time !== "Unknown" && (
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                    <span className="text-[10px] text-gray-400">Signed: </span>
                    <span className="text-[10px] text-gray-600 dark:text-gray-400 font-medium">{sig.timestamps.signing_time}</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Trust Store */}
          <div className="card overflow-hidden">
            <button onClick={loadTrustStore} className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition">
              <div className="flex items-center gap-2">
                <span className="text-sm">🛡️</span>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-xs">Trust Store</p>
                  <p className="text-[10px] text-gray-500">{trustStore.length} cert(s)</p>
                </div>
              </div>
              <span className="text-gray-400 text-xs">{showTrustStore ? "▲" : "▼"}</span>
            </button>

            {showTrustStore && (
              <div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-2 animate-slideUp">
                <div className="flex gap-1.5 flex-wrap">
                  {file && hasUntrusted && (
                    <button onClick={handleBulkTrust} disabled={bulkTrusting} className="btn btn-primary btn-sm text-[10px] px-2 py-1">
                      {bulkTrusting ? "⏳" : "🔗 Trust Full Chain"}
                    </button>
                  )}
                  <button onClick={() => handleLoadCaBundle("india")} disabled={loadingBundle} className="btn btn-outline btn-sm text-[10px] px-2 py-1">
                    {loadingBundle ? "⏳" : "🇮🇳 India CA"}
                  </button>
                </div>
                {trustStore.length === 0 ? (
                  <p className="text-[11px] text-gray-500 text-center py-3">No trusted certificates.</p>
                ) : (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
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

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={reset} className="btn btn-outline flex-1 text-xs">🔍 Verify Another</button>
            <ExportButton file={file} result={result} hasUntrusted={hasUntrusted} />
          </div>
        </div>
      </div>

      {/* ─── Right Panel: PDF Preview ─────────────────── */}
      <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-900 flex flex-col">
        <div className="flex items-center justify-between bg-white dark:bg-gray-950 px-4 py-2 border-b border-gray-200/60 dark:border-gray-800/60 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm">📄</span>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">PDF Preview</span>
          </div>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
            result.is_valid ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : hasUntrusted ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          }`}>
            {result.is_valid ? "✓ VERIFIED" : hasUntrusted ? "⚠ UNTRUSTED" : "✗ INVALID"}
          </div>
        </div>
        <div className="flex-1 relative">
          <iframe
            src={file ? URL.createObjectURL(file) : ""}
            className="w-full h-full border-0"
            title="PDF Preview"
          />
          {/* Floating badge */}
          <div className="absolute top-4 right-4 animate-bounceIn">
            <div className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl shadow-xl backdrop-blur-sm ${
              result.is_valid ? "bg-green-500/90 text-white"
                : hasUntrusted ? "bg-amber-500/90 text-white"
                : "bg-red-500/90 text-white"
            }`}>
              <div className="text-2xl font-bold">
                {result.is_valid ? "✓" : hasUntrusted ? "⚠" : "✗"}
              </div>
              <div className="text-[10px] font-bold tracking-wide">
                {result.is_valid ? "SIGNATURE VALID" : hasUntrusted ? "UNTRUSTED" : "INVALID"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportButton({ file, result, hasUntrusted }: { file: File | null; result: VerificationResult | null; hasUntrusted: boolean | undefined }) {
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<any>(null);

  const handleExport = async () => {
    if (!file) return;
    setExporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE}/api/verify/stamp`, { method: "POST", body: form });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Export failed"); }
      setExportResult(await res.json());
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  if (exportResult) {
    return (
      <a href={`${API_BASE}${exportResult.download_url}`} className="btn btn-primary flex-1 text-xs" download>
        ⬇️ Download Verified
      </a>
    );
  }

  return (
    <button onClick={handleExport} disabled={exporting || !file} className="btn btn-primary flex-1 text-xs">
      {exporting ? "⏳..." : "📄 Export"}
    </button>
  );
}
