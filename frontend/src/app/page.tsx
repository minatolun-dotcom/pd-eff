"use client";

import { useState, useEffect, useCallback } from "react";
import PdfSigner from "@/components/PdfSigner";
import UsbKeyDetector from "@/components/UsbKeyDetector";
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

type Step = "upload" | "configure" | "sign" | "done";

const steps: { key: Step; label: string; icon: string }[] = [
  { key: "upload", label: "Upload", icon: "📄" },
  { key: "configure", label: "Configure", icon: "⚙️" },
  { key: "sign", label: "Sign", icon: "✍️" },
  { key: "done", label: "Done", icon: "✅" },
];

function StepIndicator({ current }: { current: Step }) {
  const idx = steps.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`step-dot ${
                i < idx ? "done" : i === idx ? "active" : "pending"
              }`}
            >
              {i < idx ? "✓" : i + 1}
            </div>
            <span
              className={`text-xs mt-1.5 font-medium ${
                i === idx ? "text-blue-600" : i < idx ? "text-green-600" : "text-gray-400 dark:text-gray-500"
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`step-line mx-2 ${
                i < idx ? "done" : "pending"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function SignPage() {
  const [step, setStep] = useState<Step>("upload");
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
    setStep("upload");
    setPdfFile(null);
    setResult(null);
    setError("");
    setSelectedToken(null);
    setSelectedCert("");
    setPin("");
    setCertPassphrase("");
  };

  return (
    <div className="max-w-5xl mx-auto">
      <StepIndicator current={step} />

      {/* ─── Step 1: Upload ───────────────────────────── */}
      {step === "upload" && (
        <div className="animate-fadeIn">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Sign a PDF Document
            </h1>
            <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 text-base">
              Upload your PDF, draw where you want the signature, and sign with your digital key.
            </p>
          </div>

          <div
            className={`card p-12 transition-all duration-300 ${
              isDragging ? "active border-blue-400 bg-blue-50 dark:bg-blue-900/20/50" : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <label className="flex flex-col items-center justify-center w-full h-80 cursor-pointer group">
              <div className="relative mb-6">
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-50 dark:from-blue-900/20 to-indigo-100 dark:to-indigo-900/20 flex items-center justify-center text-5xl group-hover:scale-110 transition-transform duration-300">
                  📄
                </div>
                <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/200 text-white flex items-center justify-center text-lg shadow-lg shadow-blue-500/30 group-hover:rotate-90 transition-transform duration-300">
                  +
                </div>
              </div>
              <p className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-1">
                {isDragging ? "Drop your PDF here" : "Drop a PDF here or click to upload"}
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                PDF files up to 50MB
              </p>
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>
        </div>
      )}

      {/* ─── Step 2: Configure ────────────────────────── */}
      {step === "configure" && pdfFile && (
        <div className="space-y-5 animate-slideUp">
          {/* File info chip */}
          <div className="flex items-center gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/80 rounded-2xl px-5 py-3 animate-scaleIn">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-lg">
              ✅
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-green-900 text-sm truncate">{pdfFile.name}</p>
              <p className="text-green-600 text-xs">{(pdfFile.size / 1024).toFixed(0)} KB</p>
            </div>
            <button
              onClick={() => { setStep("upload"); setPdfFile(null); }}
              className="text-green-600 hover:text-green-800 text-sm font-medium hover:underline"
            >
              Change
            </button>
          </div>

          {/* Signing method */}
          <div className="card p-5">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-xs">1</span>
              Signing Method
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSignMethod("key")}
                className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                  signMethod === "key"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm shadow-blue-500/10"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800"
                }`}
              >
                <div className="text-2xl mb-2">🔐</div>
                <div className="font-semibold text-gray-900 dark:text-white text-sm">Digital Key</div>
                <div className="text-gray-500 dark:text-gray-400 dark:text-gray-500 text-xs mt-1">USB key, smart card, HSM</div>
              </button>
              <button
                onClick={() => setSignMethod("certificate")}
                className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                  signMethod === "certificate"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm shadow-blue-500/10"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800"
                }`}
              >
                <div className="text-2xl mb-2">📜</div>
                <div className="font-semibold text-gray-900 dark:text-white text-sm">Certificate File</div>
                <div className="text-gray-500 dark:text-gray-400 dark:text-gray-500 text-xs mt-1">Upload .pfx/.p12 file</div>
              </button>
            </div>
          </div>

          {/* Digital Key config */}
          {signMethod === "key" && (
            <div className="card p-5 animate-slideUp">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-xs">2</span>
                Digital Key
              </h3>
              <UsbKeyDetector
                onTokenDetected={(token, path) => {
                  setSelectedToken(token);
                  setModulePath(path);
                }}
                selectedToken={selectedToken}
              />
              {selectedToken && (
                <div className="mt-4 animate-slideUp">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">PIN Code</label>
                  <input
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Enter your PIN"
                    className="input"
                  />
                </div>
              )}
            </div>
          )}

          {/* Certificate config */}
          {signMethod === "certificate" && (
            <div className="card p-5 animate-slideUp">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-xs">2</span>
                Select Certificate
              </h3>
              {certificates.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 text-sm mb-2">No certificates available</p>
                  <a
                    href="/certificates"
                    className="btn btn-primary btn-sm"
                  >
                    Generate a Certificate →
                  </a>
                </div>
              ) : (
                <div className="space-y-2">
                  {certificates.map((cert) => (
                    <label
                      key={cert.id}
                      className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition-all duration-200 ${
                        selectedCert === cert.id
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm shadow-blue-500/10"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        selectedCert === cert.id
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/200"
                          : "border-gray-300 dark:border-gray-600"
                      }`}>
                        {selectedCert === cert.id && (
                          <div className="w-2 h-2 rounded-full bg-white dark:bg-gray-900" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">{cert.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 truncate">
                          {cert.subject_cn} · {cert.key_algorithm}
                          {cert.not_valid_after && (
                            <> · expires {new Date(cert.not_valid_after).toLocaleDateString()}</>
                          )}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {selectedCert && (
                <div className="mt-4 animate-slideUp">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Passphrase</label>
                  <input
                    type="password"
                    value={certPassphrase}
                    onChange={(e) => setCertPassphrase(e.target.value)}
                    placeholder="Enter certificate passphrase"
                    className="input"
                  />
                </div>
              )}
            </div>
          )}

          {/* Continue button */}
          <button
            onClick={() => setStep("sign")}
            disabled={
              signMethod === "key"
                ? !selectedToken || !pin
                : !selectedCert || !certPassphrase
            }
            className="btn btn-primary btn-lg w-full"
          >
            Continue to Sign →
          </button>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-2xl p-4 text-red-700 text-sm animate-slideUp flex items-start gap-3">
              <span className="text-lg">⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* ─── Step 3: Sign (PDF viewer) ────────────────── */}
      {step === "sign" && pdfFile && (
        <div className="space-y-5 animate-slideUp">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-lg">
                ✍️
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Draw Signature Area</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
                  Draw a rectangle on the PDF where you want your signature
                </p>
              </div>
            </div>
            <button
              onClick={() => setStep("configure")}
              className="btn btn-outline btn-sm"
            >
              ← Back
            </button>
          </div>

          <div className="card overflow-hidden shadow-lg shadow-gray-200/50">
            <PdfSigner
              file={pdfFile}
              onSign={handleSign}
              signing={signing}
            />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-2xl p-4 text-red-700 text-sm animate-slideUp flex items-start gap-3">
              <span className="text-lg">⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* ─── Step 4: Done ─────────────────────────────── */}
      {step === "done" && result && (
        <div className="space-y-5 animate-bounceIn">
          {/* Success card */}
          <div className="card p-10 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 opacity-60" />
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-4xl text-white mx-auto mb-5 shadow-lg shadow-green-500/30">
                ✅
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Signed Successfully!</h2>
              <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-8">Your PDF has been digitally signed and is ready to download.</p>

              <div className="flex gap-3 justify-center">
                <a
                  href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}${result.download_url}`}
                  className="btn btn-primary btn-lg"
                >
                  ⬇️ Download Signed PDF
                </a>
                <button
                  onClick={reset}
                  className="btn btn-outline btn-lg"
                >
                  Sign Another
                </button>
              </div>
            </div>
          </div>

          {/* Signature details */}
          <div className="card p-5">
            <h4 className="font-bold text-gray-900 dark:text-white mb-3 text-sm flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center text-xs">📋</span>
              Signature Details
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Field Name</span>
                <p className="font-mono text-sm text-gray-900 dark:text-white mt-0.5">{result.field_name}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Signer</span>
                <p className="text-sm text-gray-900 dark:text-white mt-0.5">{result.signer_name}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Signed At</span>
                <p className="text-sm text-gray-900 dark:text-white mt-0.5">{new Date(result.timestamp).toLocaleString()}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">File</span>
                <p className="text-sm text-gray-900 dark:text-white mt-0.5 truncate">{result.signed_filename}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
