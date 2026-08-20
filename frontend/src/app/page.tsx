"use client";

import { useState, useEffect, useCallback } from "react";
import PdfSigner from "@/components/PdfSigner";
import UsbKeyDetector from "@/components/UsbKeyDetector";
import { saveSessionPin, loadSessionPin, clearSessionPin } from "@/components/UsbKeyDetector";
import { listCertificates, Certificate } from "@/lib/api";

interface Pkcs11Token {
  slot_id: number;
  label: string;
  serial_number: string;
  model: string;
  manufacturer: string;
  keys: Array<{ label: string; type: string; id: string; can_sign?: boolean }>;
}

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Step = "configure" | "sign" | "done";

export default function SignPage() {
  const [step, setStep] = useState<Step>("configure");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [signMethod, setSignMethod] = useState<"key" | "certificate">("key");
  const [selectedToken, setSelectedToken] = useState<Pkcs11Token | null>(null);
  const [modulePath, setModulePath] = useState("");
  const [pin, setPin] = useState("");
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [selectedCert, setSelectedCert] = useState("");
  const [certPassphrase, setCertPassphrase] = useState("");
  const [signing, setSigning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    listCertificates().then(setCertificates).catch(console.error);
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
      setStep("configure");
      setError("");
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleSign = async (rectangle: Rectangle, pageNumber: number) => {
    if (!pdfFile) return;

    if (signMethod === "key") {
      if (!selectedToken || !modulePath || !pin) {
        setError("Please detect a digital key and enter your PIN");
        return;
      }
    } else {
      if (!selectedCert) {
        setError("Please select a certificate");
        return;
      }
    }

    setSigning(true);
    setError("");

    try {
      const form = new FormData();
      form.append("file", pdfFile);
      form.append("visible", "true");
      form.append(
        "signer_name",
        signMethod === "key"
          ? selectedToken?.label || "Digital Key"
          : certificates.find((c) => c.id === selectedCert)?.name || "User"
      );

      form.append("position", "custom");
      form.append("custom_x1", String(Math.round(rectangle.x)));
      form.append("custom_y1", String(Math.round(rectangle.y)));
      form.append("custom_x2", String(Math.round(rectangle.x + rectangle.width)));
      form.append("custom_y2", String(Math.round(rectangle.y + rectangle.height)));

      let url: string;
      if (signMethod === "key") {
        url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/sign/pkcs11`;
        form.append("module_path", modulePath);
        form.append("token_label", selectedToken!.label);
        form.append("pin", pin);
      } else {
        url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/sign/advanced`;
        form.append("certificate_id", selectedCert);
        form.append("passphrase", certPassphrase);
      }

      const res = await fetch(url, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Signing failed");
      }
      const data = await res.json();
      setResult(data);
      setStep("done");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSigning(false);
    }
  };

  const reset = () => {
    setStep("configure");
    setPdfFile(null);
    setResult(null);
    setError("");
    setSelectedToken(null);
    setSelectedCert("");
    setPin("");
    setCertPassphrase("");
  };

  // ─── Upload Screen (no file selected) ────────────────────────
  if (!pdfFile) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="w-full max-w-2xl animate-fadeIn">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Sign a PDF Document
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-base">
              Upload your PDF, draw where you want the signature, and sign with your digital key.
            </p>
          </div>

          <div
            className={`card p-12 transition-all duration-300 ${
              isDragging ? "active border-blue-400 bg-blue-50 dark:bg-blue-900/20" : ""
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <label className="flex flex-col items-center justify-center w-full h-64 cursor-pointer group">
              <div className="relative mb-5">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-50 dark:from-blue-900/20 to-indigo-100 dark:to-indigo-900/20 flex items-center justify-center text-4xl group-hover:scale-110 transition-transform duration-300">
                  📄
                </div>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl bg-blue-500 text-white flex items-center justify-center text-sm shadow-lg shadow-blue-500/30 group-hover:rotate-90 transition-transform duration-300">
                  +
                </div>
              </div>
              <p className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
                {isDragging ? "Drop your PDF here" : "Drop a PDF here or click to upload"}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                PDF files up to 50MB
              </p>
              <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
            </label>
          </div>
        </div>
      </div>
    );
  }

  // ─── Done Screen ─────────────────────────────────────────────
  if (step === "done" && result) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="w-full max-w-2xl animate-bounceIn">
          <div className="card p-10 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/10 dark:via-emerald-900/10 dark:to-teal-900/10 opacity-60" />
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-4xl text-white mx-auto mb-5 shadow-lg shadow-green-500/30">
                ✅
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Signed Successfully!</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-8">Your PDF has been digitally signed and is ready to download.</p>

              <div className="flex gap-3 justify-center">
                <a
                  href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}${result.download_url}`}
                  className="btn btn-primary btn-lg"
                >
                  ⬇️ Download Signed PDF
                </a>
                <button onClick={reset} className="btn btn-outline btn-lg">
                  Sign Another
                </button>
              </div>
            </div>
          </div>

          <div className="card p-5 mt-5">
            <h4 className="font-bold text-gray-900 dark:text-white mb-3 text-sm flex items-center gap-2">
              📋 Signature Details
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Field Name</span>
                <p className="font-mono text-sm text-gray-900 dark:text-white mt-0.5">{result.field_name}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Signer</span>
                <p className="text-sm text-gray-900 dark:text-white mt-0.5">{result.signer_name}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Signed At</span>
                <p className="text-sm text-gray-900 dark:text-white mt-0.5">{new Date(result.timestamp).toLocaleString()}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">File</span>
                <p className="text-sm text-gray-900 dark:text-white mt-0.5 truncate">{result.signed_filename}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Configure + Sign (side-by-side layout) ──────────────────
  return (
    <div className="panel-split">
      {/* ─── Left Panel: Config ──────────────────────── */}
      <div className="border-r border-gray-200/60 dark:border-gray-800/60 overflow-y-auto bg-white dark:bg-gray-950">
        <div className="p-5 space-y-4">
          {/* File info */}
          <div className="flex items-center gap-3 bg-green-50 dark:bg-green-900/15 border border-green-200 dark:border-green-800/60 rounded-xl px-4 py-2.5">
            <span className="text-lg">✅</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-green-900 dark:text-green-300 text-sm truncate">{pdfFile.name}</p>
              <p className="text-green-600 dark:text-green-400 text-xs">{(pdfFile.size / 1024).toFixed(0)} KB</p>
            </div>
            <button
              onClick={() => { setPdfFile(null); setStep("configure"); }}
              className="text-green-600 hover:text-green-800 text-xs font-medium"
            >
              Change
            </button>
          </div>

          {/* Step indicator — compact horizontal */}
          <div className="flex items-center gap-2 text-xs">
            <span className={`font-bold px-2.5 py-1 rounded-full ${step === "configure" ? "bg-blue-500 text-white" : "bg-green-500 text-white"}`}>
              {step === "configure" ? "1" : "✓"}
            </span>
            <div className={`h-0.5 flex-1 rounded ${step === "configure" ? "bg-gray-200 dark:bg-gray-700" : "bg-green-500"}`} />
            <span className={`font-bold px-2.5 py-1 rounded-full ${step === "sign" ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-500"}`}>
              2
            </span>
          </div>

          {/* Signing Method */}
          {step === "configure" && (
            <div className="space-y-3 animate-slideUp">
              <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Signing Method
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSignMethod("key")}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    signMethod === "key"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                  }`}
                >
                  <div className="text-xl mb-1">🔐</div>
                  <div className="font-semibold text-gray-900 dark:text-white text-xs">Digital Key</div>
                  <div className="text-gray-500 dark:text-gray-400 text-[10px] mt-0.5">USB, smart card, HSM</div>
                </button>
                <button
                  onClick={() => setSignMethod("certificate")}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    signMethod === "certificate"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                  }`}
                >
                  <div className="text-xl mb-1">📜</div>
                  <div className="font-semibold text-gray-900 dark:text-white text-xs">Certificate</div>
                  <div className="text-gray-500 dark:text-gray-400 text-[10px] mt-0.5">Upload .pfx/.p12</div>
                </button>
              </div>

              {/* Digital Key */}
              {signMethod === "key" && (
                <div className="space-y-3 animate-slideUp">
                  <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Digital Key
                  </h3>
                  <UsbKeyDetector
                    onTokenDetected={(token, path) => {
                      setSelectedToken(token);
                      setModulePath(path);
                      // Load cached PIN for this session
                      const cached = loadSessionPin();
                      if (cached) setPin(cached);
                    }}
                    onClearSelection={() => {
                      setSelectedToken(null);
                      setModulePath("");
                      setPin("");
                      clearSessionPin();
                    }}
                    selectedToken={selectedToken}
                  />
                  {selectedToken && (
                    <div className="animate-slideUp">
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">PIN Code</label>
                      <input
                        type="password"
                        value={pin}
                        onChange={(e) => {
                          setPin(e.target.value);
                          saveSessionPin(e.target.value);
                        }}
                        placeholder="Enter your PIN"
                        className="input text-sm"
                      />
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">PIN cached for this browser session</p>
                    </div>
                  )}
                </div>
              )}

              {/* Certificate */}
              {signMethod === "certificate" && (
                <div className="space-y-3 animate-slideUp">
                  <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Select Certificate
                  </h3>
                  {certificates.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-gray-500 text-xs mb-2">No certificates available</p>
                      <a href="/certificates" className="btn btn-primary btn-sm text-xs">
                        Generate →
                      </a>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {certificates.map((cert) => (
                        <label
                          key={cert.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border-2 cursor-pointer transition-all text-xs ${
                            selectedCert === cert.id
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                              : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            selectedCert === cert.id ? "border-blue-500 bg-blue-500" : "border-gray-300 dark:border-gray-600"
                          }`}>
                            {selectedCert === cert.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 dark:text-white truncate">{cert.name}</p>
                            <p className="text-gray-500 dark:text-gray-400 truncate">
                              {cert.subject_cn} · {cert.key_algorithm}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                  {selectedCert && (
                    <div className="animate-slideUp">
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Passphrase</label>
                      <input
                        type="password"
                        value={certPassphrase}
                        onChange={(e) => setCertPassphrase(e.target.value)}
                        placeholder="Certificate passphrase"
                        className="input text-sm"
                      />
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => setStep("sign")}
                disabled={signMethod === "key" ? !selectedToken || !pin : !selectedCert || !certPassphrase}
                className="btn btn-primary w-full text-sm"
              >
                Continue to Sign →
              </button>
            </div>
          )}

          {/* Sign step — compact info */}
          {step === "sign" && (
            <div className="space-y-3 animate-slideUp">
              <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Draw Signature Area
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Draw a rectangle on the PDF where you want your signature placed.
              </p>
              <button onClick={() => setStep("configure")} className="btn btn-outline btn-sm w-full text-xs">
                ← Back to Configure
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl p-3 text-red-700 text-xs animate-slideUp flex items-start gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Right Panel: PDF Viewer ─────────────────── */}
      <div className="overflow-hidden bg-gray-100 dark:bg-gray-900 flex flex-col">
        {step === "configure" ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <div className="text-5xl mb-3">📄</div>
              <p className="text-sm font-medium">Configure signing options, then draw signature area</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
            <PdfSigner
              file={pdfFile}
              onSign={handleSign}
              signing={signing}
            />
          </div>
        )}
      </div>
    </div>
  );
}
