"use client";

import { useState, useEffect } from "react";
import {
  Certificate,
  listCertificates,
  uploadCertificate,
  generateCertificate,
  deleteCertificate,
} from "@/lib/api";

export default function CertificatesPage() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [tab, setTab] = useState<"list" | "upload" | "generate">("list");

  // Upload form
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadPassphrase, setUploadPassphrase] = useState("");

  // Generate form
  const [genCn, setGenCn] = useState("Test Signer");
  const [genOrg, setGenOrg] = useState("PDF Signer App");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadCertificates = () => {
    listCertificates().then(setCertificates).catch(console.error);
  };

  useEffect(() => {
    loadCertificates();
  }, []);

  const handleUpload = async () => {
    if (!uploadFile) return;
    setLoading(true);
    setError("");
    try {
      await uploadCertificate(uploadFile, uploadName, uploadPassphrase);
      setSuccess("Certificate uploaded successfully!");
      setUploadFile(null);
      setUploadName("");
      setUploadPassphrase("");
      setTab("list");
      loadCertificates();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await generateCertificate(genCn, genOrg);
      setSuccess(
        `${res.message}\nPassphrase: ${res.passphrase}`
      );
      setTab("list");
      loadCertificates();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this certificate?")) return;
    try {
      await deleteCertificate(id);
      loadCertificates();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Certificates</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Manage digital certificates for signing PDFs. Upload a PKCS#12 file or
          generate a self-signed certificate for testing.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: "list" as const, label: "📋 My Certificates", count: certificates.length },
          { id: "upload" as const, label: "📤 Upload" },
          { id: "generate" as const, label: "🆕 Generate" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError(""); setSuccess(""); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === t.id
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-2 bg-white dark:bg-gray-900/20 px-2 py-0.5 rounded-full text-xs">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 mb-4">
          ❌ {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 mb-4 whitespace-pre-wrap">
          ✅ {success}
        </div>
      )}

      {/* Certificate List */}
      {tab === "list" && (
        <div className="space-y-4">
          {certificates.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
              <div className="text-5xl mb-4">📜</div>
              <p className="text-gray-500 dark:text-gray-400 mb-4">No certificates yet</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Upload a PKCS#12 file or generate a self-signed certificate to get
                started.
              </p>
            </div>
          ) : (
            certificates.map((cert) => (
              <div
                key={cert.id}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="text-3xl">
                      {cert.is_self_signed ? "🔑" : "🔐"}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{cert.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{cert.filename}</p>
                      <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                        <div>                            <span className="text-gray-500 dark:text-gray-400">Subject: </span>
                          <span className="text-gray-700 dark:text-gray-300">
                            {cert.subject_cn}
                            {cert.subject_o && ` (${cert.subject_o})`}
                          </span>
                        </div>
                        <div>                            <span className="text-gray-500 dark:text-gray-400">Issuer: </span>
                          <span className="text-gray-700 dark:text-gray-300">{cert.issuer_cn}</span>
                        </div>
                        <div>                            <span className="text-gray-500 dark:text-gray-400">Algorithm: </span>
                          <span className="text-gray-700 dark:text-gray-300">{cert.key_algorithm}</span>
                        </div>
                        <div>                            <span className="text-gray-500 dark:text-gray-400">Expires: </span>
                          <span className="text-gray-700 dark:text-gray-300">
                            {cert.not_valid_after
                              ? new Date(cert.not_valid_after).toLocaleDateString()
                              : "N/A"}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        {cert.is_self_signed && (
                          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                            Self-signed
                          </span>
                        )}
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                          {cert.key_algorithm}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(cert.id)}
                    className="text-gray-500 dark:text-gray-400 hover:text-red-600 transition p-2"
                    title="Delete certificate"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Upload Tab */}
      {tab === "upload" && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              PKCS#12 Certificate File (.pfx or .p12)
            </label>
            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
              <div className="text-4xl mb-2">📤</div>
              <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500">
                {uploadFile ? uploadFile.name : "Click to select .pfx or .p12 file"}
              </p>
              <input
                type="file"
                accept=".pfx,.p12"
                className="hidden"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="e.g. My Signing Certificate"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Passphrase
            </label>
            <input
              type="password"
              value={uploadPassphrase}
              onChange={(e) => setUploadPassphrase(e.target.value)}
              placeholder="Enter certificate passphrase"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <button
            onClick={handleUpload}
            disabled={!uploadFile || loading}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
          >
            {loading ? "⏳ Uploading..." : "📤 Upload Certificate"}
          </button>
        </div>
      )}

      {/* Generate Tab */}
      {tab === "generate" && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
            ⚠️ This generates a <strong>self-signed certificate</strong> for testing
            purposes. Self-signed certificates will show as &quot;untrusted&quot; in verification.
            For production, use a certificate from a trusted CA.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Common Name (Signer Name)
            </label>
            <input
              type="text"
              value={genCn}
              onChange={(e) => setGenCn(e.target.value)}
              placeholder="e.g. John Smith"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Organization
            </label>
            <input
              type="text"
              value={genOrg}
              onChange={(e) => setGenOrg(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
          >
            {loading ? "⏳ Generating..." : "🆕 Generate Self-Signed Certificate"}
          </button>
        </div>
      )}
    </div>
  );
}
