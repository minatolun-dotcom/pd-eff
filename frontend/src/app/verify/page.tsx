"use client";

import { useState, useCallback } from "react";
import { verifyPdf, VerificationResult } from "@/lib/api";

export default function VerifyPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = useCallback((f: File) => {
    if (f && f.type === "application/pdf") {
      setFile(f);
      setResult(null);
      setError("");
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError("");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Verify Signatures
        </h1>
        <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 text-base">
          Upload a signed PDF to verify its digital signatures and integrity.
        </p>
      </div>

      {/* Upload & Verify */}
      {!result && (
        <div className="space-y-5 animate-fadeIn">
          <div
            className={`card p-10 transition-all duration-300 ${
              isDragging ? "active border-blue-400 bg-blue-50/50" : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <label className="flex flex-col items-center justify-center w-full cursor-pointer group">
              <div className="relative mb-6">
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-green-50 dark:from-green-900/20 to-emerald-100 flex items-center justify-center text-5xl group-hover:scale-110 transition-transform duration-300">
                  🔍
                </div>
                {file && (
                  <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-green-50 dark:bg-green-900/200 text-white flex items-center justify-center text-sm shadow-lg animate-bounceIn">
                    ✓
                  </div>
                )}
              </div>
              <p className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-1">
                {file
                  ? file.name
                  : isDragging
                  ? "Drop your PDF here"
                  : "Drop a signed PDF here or click to upload"}
              </p>
              {file ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {(file.size / 1024).toFixed(0)} KB · Ready to verify
                </p>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  PDF files up to 50MB
                </p>
              )}
              <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
            </label>
          </div>

          {file && (
            <div className="flex gap-3">
              <button
                onClick={handleVerify}
                disabled={loading}
                className="btn btn-success btn-lg flex-1"
              >
                {loading ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Verifying Signatures...
                  </>
                ) : (
                  "✅ Verify Signatures"
                )}
              </button>
              <button onClick={reset} className="btn btn-outline btn-lg">
                Clear
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-5 text-red-700 text-sm animate-slideUp flex items-start gap-3">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="font-semibold mb-1">Verification Failed</p>
                <p>{error}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-5 animate-slideUp">
          {/* Status banner */}
          <div
            className={`card p-8 text-center relative overflow-hidden ${
              result.is_valid
                ? "bg-gradient-to-br from-green-50 dark:from-green-900/20 to-emerald-50 dark:to-emerald-900/20"
                : result.overall_status === "NO_SIGNATURES"
                ? "bg-gradient-to-br from-amber-50 dark:from-amber-900/20 to-yellow-50 dark:to-yellow-900/20"
                : "bg-gradient-to-br from-red-50 dark:from-red-900/20 to-rose-50 dark:to-rose-900/20"
            }`}
          >
            <div className="relative">
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg ${
                  result.is_valid
                    ? "bg-green-50 dark:bg-green-900/200 text-white shadow-green-500/30"
                    : result.overall_status === "NO_SIGNATURES"
                    ? "bg-amber-400 text-white shadow-amber-400/30"
                    : "bg-red-50 dark:bg-red-900/200 text-white shadow-red-500/30"
                }`}
              >
                {result.is_valid ? "✅" : result.overall_status === "NO_SIGNATURES" ? "⚠️" : "❌"}
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                {result.is_valid
                  ? "All Signatures Valid"
                  : result.overall_status === "NO_SIGNATURES"
                  ? "No Digital Signatures"
                  : "Signatures Invalid"}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500">
                {result.overall_status === "NO_SIGNATURES"
                  ? "This PDF has no digital signatures."
                  : result.is_valid
                  ? "All signatures are intact and their certificates are valid."
                  : "One or more signatures are invalid or have been tampered with."}
              </p>
            </div>
          </div>

          {/* File info */}
          <div className="card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg shrink-0">
                📄
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 truncate">{result.filename}</span>
            </div>
            <span className="badge badge-info shrink-0">{result.signature_count} signature(s)</span>
          </div>

          {/* Signature details */}
          {result.signatures.map((sig, i) => (
            <div
              key={i}
              className={`card p-5 border-l-4 ${
                sig.intact && sig.valid
                  ? "border-l-green-500"
                  : sig.intact
                  ? "border-l-amber-500"
                  : "border-l-red-500"
              } animate-slideIn`}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold ${
                      sig.intact && sig.valid
                        ? "bg-green-50 dark:bg-green-900/200"
                        : sig.intact
                        ? "bg-amber-400"
                        : "bg-red-50 dark:bg-red-900/200"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white">
                      {sig.signer.common_name || "Unknown Signer"}
                    </p>
                    {sig.signer.organization && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">{sig.signer.organization}</p>
                    )}
                  </div>
                </div>
                <span
                  className={`badge ${
                    sig.intact && sig.valid
                      ? "badge-success"
                      : sig.intact
                      ? "badge-warning"
                      : "badge-danger"
                  }`}
                >
                  {sig.intact && sig.valid ? "✓ VALID" : sig.intact ? "⚠ UNTRUSTED" : "✗ INVALID"}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">Integrity</span>
                  <p className={`text-sm font-semibold mt-0.5 ${sig.intact ? "text-green-600" : "text-red-600"}`}>
                    {sig.intact ? "Intact" : "Tampered"}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">Trust</span>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-0.5 truncate" title={sig.trust_status}>
                    {sig.trust_status}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">Issuer</span>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-0.5 truncate" title={sig.signer.issuer_cn}>
                    {sig.signer.issuer_cn || "N/A"}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">Self-signed</span>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-0.5">
                    {sig.signer.self_signed ? "Yes" : "No"}
                  </p>
                </div>
              </div>

              {/* Timestamp info */}
              {sig.timestamps?.signing_time && sig.timestamps.signing_time !== "Unknown" && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400 dark:text-gray-500">Signed: </span>
                  <span className="text-xs text-gray-600 dark:text-gray-400 dark:text-gray-500 font-medium">{sig.timestamps.signing_time}</span>
                </div>
              )}
            </div>
          ))}

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={reset} className="btn btn-outline flex-1">
              🔍 Verify Another PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
