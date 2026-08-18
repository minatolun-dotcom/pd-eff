"use client";

import { useState } from "react";
import { verifyPdf, VerificationResult } from "@/lib/api";

export default function VerifyPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type === "application/pdf") {
      setFile(f);
      setResult(null);
      setError("");
    }
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

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Verify Signatures</h2>
        <p className="text-gray-600 text-sm mt-1">
          Upload a signed PDF to verify its digital signatures.
        </p>
      </div>

      {/* Upload & Verify */}
      {!result && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <label className="flex flex-col items-center justify-center w-full h-56 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
              <div className="text-5xl mb-3">🔍</div>
              <p className="text-lg font-medium text-gray-700">
                {file ? file.name : "Drop a signed PDF here or click to upload"}
              </p>
              {file && (
                <p className="text-sm text-gray-500 mt-1">{(file.size / 1024).toFixed(0)} KB</p>
              )}
              <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
            </label>
          </div>

          {file && (
            <button
              onClick={handleVerify}
              disabled={loading}
              className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 disabled:bg-gray-300 transition"
            >
              {loading ? "⏳ Verifying..." : "✅ Verify Signatures"}
            </button>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
              ❌ {error}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Status banner */}
          <div className={`rounded-xl p-6 text-center ${
            result.is_valid
              ? "bg-green-50 border-2 border-green-200"
              : result.overall_status === "NO_SIGNATURES"
              ? "bg-yellow-50 border-2 border-yellow-200"
              : "bg-red-50 border-2 border-red-200"
          }`}>
            <div className="text-4xl mb-2">
              {result.is_valid ? "✅" : result.overall_status === "NO_SIGNATURES" ? "⚠️" : "❌"}
            </div>
            <h3 className="text-lg font-bold mb-1">
              {result.is_valid
                ? "All Signatures Valid"
                : result.overall_status === "NO_SIGNATURES"
                ? "No Digital Signatures"
                : "Signatures Invalid"}
            </h3>
            <p className="text-sm">
              {result.overall_status === "NO_SIGNATURES"
                ? "This PDF has no digital signatures."
                : result.is_valid
                ? "All signatures are intact and valid."
                : "One or more signatures are invalid or tampered."}
            </p>
          </div>

          {/* File info */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <span className="text-sm text-gray-600">{result.filename}</span>
            <span className="text-sm font-bold">{result.signature_count} signature(s)</span>
          </div>

          {/* Signature details */}
          {result.signatures.map((sig, i) => (
            <div
              key={i}
              className={`bg-white rounded-xl border-2 p-4 ${
                sig.intact && sig.valid ? "border-green-200" : "border-red-200"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                    sig.intact && sig.valid ? "bg-green-500" : "bg-red-500"
                  }`}>
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {sig.signer.common_name || "Unknown"}
                    </p>
                    <p className="text-xs text-gray-500">{sig.signer.organization || ""}</p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  sig.intact && sig.valid
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}>
                  {sig.intact && sig.valid ? "VALID" : "INVALID"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-400">Trust: </span>
                  <span className="text-gray-700">{sig.trust_status}</span>
                </div>
                <div>
                  <span className="text-gray-400">Issuer: </span>
                  <span className="text-gray-700">{sig.signer.issuer_cn || "N/A"}</span>
                </div>
                <div>
                  <span className="text-gray-400">Integrity: </span>
                  <span className={sig.intact ? "text-green-700" : "text-red-700"}>
                    {sig.intact ? "Intact" : "TAMPERED"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Self-signed: </span>
                  <span className="text-gray-700">{sig.signer.self_signed ? "Yes" : "No"}</span>
                </div>
              </div>
            </div>
          ))}

          {/* Reset */}
          <button
            onClick={() => {
              setFile(null);
              setResult(null);
              setError("");
            }}
            className="w-full py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition text-sm"
          >
            🔍 Verify Another PDF
          </button>
        </div>
      )}
    </div>
  );
}
