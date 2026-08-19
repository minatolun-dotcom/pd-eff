"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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

  // Trust store
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
      // Extract and trust the signing certificate from the PDF
      const res = await extractAndTrust(
        file,
        sigIndex, // Use sig index to pick the right cert chain
        cert.signer.common_name || `Signer ${sigIndex + 1}`,
        "signing"
      );

      setTrustMessage(`✓ Trusted: ${res.name}`);

      // Reload trust store
      const store = await listTrustStore();
      setTrustStore(store);

      // Re-verify with trust store
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

      // Re-verify if we have a file
      if (file) {
        const newResult = await verifyPdf(file);
        setResult(newResult);
      }
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
      // Re-verify
      if (file) {
        const newResult = await verifyPdf(file);
        setResult(newResult);
      }
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
      // Re-verify if file loaded
      if (file) {
        const newResult = await verifyPdf(file);
        setResult(newResult);
      }
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

  const hasUntrusted = result?.signatures?.some(
    (s) => s.intact && s.trust_status !== "VALID"
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Verify Signatures
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-base">
          Upload a signed PDF to verify its digital signatures and integrity.
        </p>
      </div>

      {/* Upload */}
      {view === "upload" && (
        <div className="space-y-5 animate-fadeIn">
          <div
            className={`card p-10 transition-all duration-300 ${
              isDragging ? "active border-blue-400 bg-blue-50/50 dark:bg-blue-900/20" : ""
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <label className="flex flex-col items-center justify-center w-full cursor-pointer group">
              <div className="relative mb-6">
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20 flex items-center justify-center text-5xl group-hover:scale-110 transition-transform duration-300">
                  🔍
                </div>
                {file && (
                  <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center text-sm shadow-lg animate-bounceIn">
                    ✓
                  </div>
                )}
              </div>
              <p className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-1">
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
            <div className="flex gap-3">
              <button onClick={handleVerify} disabled={loading} className="btn btn-success btn-lg flex-1">
                {loading ? (<><span className="animate-spin">⏳</span> Verifying...</>) : "✅ Verify Signatures"}
              </button>
              <button onClick={reset} className="btn btn-outline btn-lg">Clear</button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-5 text-red-700 dark:text-red-400 text-sm animate-slideUp flex items-start gap-3">
              <span className="text-lg">⚠️</span>
              <div><p className="font-semibold mb-1">Verification Failed</p><p>{error}</p></div>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {view === "result" && result && (
        <div className="space-y-5 animate-slideUp">
          {/* Status banner */}
          <div className={`card p-8 text-center relative overflow-hidden ${
            result.is_valid
              ? "bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20"
              : result.overall_status === "NO_SIGNATURES"
              ? "bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20"
              : "bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20"
          }`}>
            <div className="relative">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg ${
                result.is_valid
                  ? "bg-green-500 text-white shadow-green-500/30"
                  : result.overall_status === "NO_SIGNATURES"
                  ? "bg-amber-400 text-white shadow-amber-400/30"
                  : "bg-red-500 text-white shadow-red-500/30"
              }`}>
                {result.is_valid ? "✅" : result.overall_status === "NO_SIGNATURES" ? "⚠️" : "❌"}
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                {result.is_valid
                  ? "All Signatures Valid"
                  : result.overall_status === "NO_SIGNATURES"
                  ? "No Digital Signatures"
                  : hasUntrusted
                  ? "Signatures Valid but Untrusted"
                  : "Signatures Invalid"}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {result.overall_status === "NO_SIGNATURES"
                  ? "This PDF has no digital signatures."
                  : result.is_valid
                  ? "All signatures are intact and their certificates are valid."
                  : hasUntrusted
                  ? "Signatures are intact but the certificate chain is not in your trust store. You can trust the signer below."
                  : "One or more signatures are invalid or have been tampered with."}
              </p>
            </div>
          </div>

          {/* Trust store info */}
          {trustMessage && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 text-blue-700 dark:text-blue-400 text-sm animate-slideUp">
              {trustMessage}
            </div>
          )}

          {/* File info */}
          <div className="card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg shrink-0">📄</div>
              <span className="text-sm text-gray-600 dark:text-gray-400 truncate">{result.filename}</span>
            </div>
            <span className="badge badge-info shrink-0">{result.signature_count} signature(s)</span>
          </div>

          {/* Signature details */}
          {result.signatures.map((sig, i) => {
            const isUntrusted = sig.intact && sig.trust_status !== "VALID";
            return (
              <div key={i} className={`card p-5 border-l-4 ${
                sig.intact && sig.trust_status === "VALID"
                  ? "border-l-green-500"
                  : isUntrusted
                  ? "border-l-amber-500"
                  : "border-l-red-500"
              } animate-slideIn`} style={{ animationDelay: `${i * 100}ms` }}>

                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold ${
                      sig.intact && sig.trust_status === "VALID"
                        ? "bg-green-500"
                        : isUntrusted
                        ? "bg-amber-400"
                        : "bg-red-500"
                    }`}>
                      {i + 1}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">
                        {sig.signer.common_name || "Unknown Signer"}
                      </p>
                      {(sig.signer.organization || sig.signer.issuer_cn) && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {sig.signer.organization || ""} {sig.signer.organization && sig.signer.issuer_cn ? "·" : ""} {sig.signer.issuer_cn || ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={`badge ${
                    sig.intact && sig.trust_status === "VALID"
                      ? "badge-success"
                      : isUntrusted
                      ? "badge-warning"
                      : "badge-danger"
                  }`}>
                    {sig.intact && sig.trust_status === "VALID" ? "✓ VALID" : isUntrusted ? "⚠ UNTRUSTED" : "✗ INVALID"}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                    <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Integrity</span>
                    <p className={`text-sm font-semibold mt-0.5 ${sig.intact ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {sig.intact ? "Intact" : "Tampered"}
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                    <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Trust</span>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-0.5 truncate" title={sig.trust_status}>
                      {isUntrusted ? "Untrusted" : sig.trust_status}
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                    <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Issuer</span>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-0.5 truncate" title={sig.signer.issuer_cn}>
                      {sig.signer.issuer_cn || "N/A"}
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                    <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Self-signed</span>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-0.5">
                      {sig.signer.self_signed ? "Yes" : "No"}
                    </p>
                  </div>
                </div>

                {/* Certificate chain */}
                {sig.certificates && sig.certificates.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Certificate Chain ({sig.certificates.length})</p>
                    <div className="space-y-1.5">
                      {sig.certificates.map((c, ci) => (
                        <div key={ci} className="flex items-center gap-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            c.is_self_signed ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          }`}>
                            {ci + 1}
                          </span>
                          <span className="font-medium text-gray-700 dark:text-gray-300 truncate flex-1">
                            {c.subject_cn || c.subject_full || "Unknown"}
                          </span>
                          {c.is_self_signed && <span className="text-[10px] text-purple-600 dark:text-purple-400">ROOT</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}                {/* Trust action */}
                {isUntrusted && (
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                          🔒 Certificate not in trust store
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                          Trust this signer to validate this and future signatures
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={handleBulkTrust}
                          disabled={bulkTrusting}
                          className="btn btn-outline btn-sm"
                        >
                          {bulkTrusting ? "⏳" : "🔗 Trust Chain"}
                        </button>
                        <button
                          onClick={() => handleTrustCertificate(i, sig)}
                          disabled={trusting === i}
                          className="btn btn-primary btn-sm"
                        >
                          {trusting === i ? (
                            <><span className="animate-spin">⏳</span> Trusting...</>
                          ) : (
                            "🔐 Trust Signer"
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Timestamp */}
                {sig.timestamps?.signing_time && sig.timestamps.signing_time !== "Unknown" && (
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                    <span className="text-xs text-gray-400">Signed: </span>
                    <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">{sig.timestamps.signing_time}</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Trust Store Manager */}
          <div className="card overflow-hidden">
            <button
              onClick={loadTrustStore}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-lg">
                  🛡️
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">Trust Store</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {trustStore.length} trusted certificate(s)
                  </p>
                </div>
              </div>
              <span className="text-gray-400 text-lg">{showTrustStore ? "▲" : "▼"}</span>
            </button>

            {showTrustStore && (
              <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-3 animate-slideUp">
                {/* Quick actions */}
                <div className="flex gap-2 flex-wrap">
                  {file && hasUntrusted && (
                    <button
                      onClick={handleBulkTrust}
                      disabled={bulkTrusting}
                      className="btn btn-primary btn-sm"
                    >
                      {bulkTrusting ? (<>⏳ Trusting...</>) : "🔗 Trust Full Chain"}
                    </button>
                  )}
                  <button
                    onClick={() => handleLoadCaBundle("india")}
                    disabled={loadingBundle}
                    className="btn btn-outline btn-sm"
                  >
                    {loadingBundle ? (<>⏳ Loading...</>) : "🇮🇳 Load India CA Roots"}
                  </button>
                </div>

                {trustStore.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    No certificates in trust store. Click "Trust this signer" or load a CA bundle above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {trustStore.map((cert) => (
                      <div key={cert.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                        <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-sm">🛡️</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{cert.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {cert.issuer_cn} · Added {cert.added_at ? new Date(cert.added_at).toLocaleDateString() : "recently"}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveTrust(cert.id)}
                          className="text-red-500 hover:text-red-700 dark:hover:text-red-400 text-xs font-medium hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PDF Preview */}
          {file && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-sm">📄</span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">PDF Preview</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Verification badge on preview */}
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                    result.is_valid
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : hasUntrusted
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  }`}>
                    {result.is_valid ? "✓" : hasUntrusted ? "⚠" : "✗"}
                    {result.is_valid ? "VERIFIED" : hasUntrusted ? "UNTRUSTED" : "INVALID"}
                  </div>
                </div>
              </div>
              <div className="relative bg-gray-100 dark:bg-gray-900 flex justify-center" style={{ maxHeight: "500px" }}>
                <iframe
                  src={file ? URL.createObjectURL(file) : ""}
                  className="w-full border-0"
                  style={{ height: "500px" }}
                  title="PDF Preview"
                />
                {/* Overlay signature badge (like Acrobat) */}
                <div className="absolute top-4 right-4 animate-bounceIn">
                  <div className={`flex flex-col items-center gap-1 px-4 py-3 rounded-2xl shadow-xl backdrop-blur-sm ${
                    result.is_valid
                      ? "bg-green-500/90 text-white"
                      : hasUntrusted
                      ? "bg-amber-500/90 text-white"
                      : "bg-red-500/90 text-white"
                  }`}>
                    <div className="text-3xl font-bold">
                      {result.is_valid ? "✓" : hasUntrusted ? "⚠" : "✗"}
                    </div>
                    <div className="text-xs font-bold tracking-wide">
                      {result.is_valid ? "SIGNATURE VALID" : hasUntrusted ? "UNTRUSTED" : "SIGNATURE INVALID"}
                    </div>
                    <div className="text-[10px] opacity-80">
                      {result.signature_count} signature(s)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={reset} className="btn btn-outline flex-1">🔍 Verify Another PDF</button>
            <ExportButton file={file} result={result} hasUntrusted={hasUntrusted} />
          </div>
        </div>
      )}
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

      const res = await fetch(`${API_BASE}/api/verify/stamp`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Export failed");
      }
      const data = await res.json();
      setExportResult(data);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  if (exportResult) {
    return (
      <a
        href={`${API_BASE}${exportResult.download_url}`}
        className="btn btn-primary flex-1"
        download
      >
        ⬇️ Download Verified PDF
      </a>
    );
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting || !file}
      className="btn btn-primary flex-1"
    >
      {exporting ? (
        <><span className="animate-spin">⏳</span> Creating...</>
      ) : (
        "📄 Export Verified PDF"
      )}
    </button>
  );
}
