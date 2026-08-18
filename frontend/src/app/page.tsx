"use client";

import { useState, useEffect } from "react";
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

type Step = "upload" | "sign" | "done";

export default function SignPage() {
  const [step, setStep] = useState<Step>("upload");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [signMethod, setSignMethod] = useState<"key" | "certificate">("key");
  const [selectedToken, setSelectedToken] = useState<Pkcs11Token | null>(null);
  const [modulePath, setModulePath] = useState("");
  const [pin, setPin] = useState("");
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [selectedCert, setSelectedCert] = useState<string>("");
  const [certPassphrase, setCertPassphrase] = useState("");
  const [signing, setSigning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listCertificates().then(setCertificates).catch(console.error);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
      setStep("sign");
    }
  };

  const handleSign = async (rectangle: Rectangle, pageNumber: number) => {
    if (!pdfFile) return;

    // Validate inputs
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
      form.append("signer_name", signMethod === "key" ? (selectedToken?.label || "Digital Key") : (certificates.find(c => c.id === selectedCert)?.name || "User"));

      // Position from drawn rectangle
      form.append("position", "custom");
      form.append("custom_x1", String(Math.round(rectangle.x)));
      form.append("custom_y1", String(Math.round(rectangle.y)));
      form.append("custom_x2", String(Math.round(rectangle.x + rectangle.width)));
      form.append("custom_y2", String(Math.round(rectangle.y + rectangle.height)));

      let url: string;
      if (signMethod === "key") {         url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/sign/pkcs11`;
        form.append("module_path", modulePath);
        form.append("token_label", selectedToken!.label);
        form.append("pin", pin);
      } else {         url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/sign/advanced`;
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

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Sign a PDF</h2>
        <p className="text-gray-600 text-sm mt-1">
          Upload a PDF, draw where you want the signature, and sign with your digital key.
        </p>
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div className="bg-white rounded-xl border border-gray-200 p-12">
          <label className="flex flex-col items-center justify-center w-full h-72 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
            <div className="text-7xl mb-4">📄</div>
            <p className="text-xl font-medium text-gray-700">Drop a PDF here or click to upload</p>
            <p className="text-sm text-gray-500 mt-2">PDF files only</p>
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
          </label>
        </div>
      )}

      {/* Step 2: Sign */}
      {step === "sign" && pdfFile && (
        <div className="space-y-4">
          {/* File info */}
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 flex items-center gap-2">
            <span>✅</span>
            <span className="font-medium text-green-900 text-sm">{pdfFile.name}</span>
            <span className="text-green-700 text-sm">({(pdfFile.size / 1024).toFixed(0)} KB)</span>
          </div>

          {/* Signing method */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">🔑 Signing Method</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setSignMethod("key")}
                className={`flex-1 p-3 rounded-lg border-2 text-left transition text-sm ${
                  signMethod === "key" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="font-medium">🔐 Digital Key (Recommended)</div>
                <div className="text-gray-500 text-xs mt-1">USB key, smart card, HSM</div>
              </button>
              <button
                onClick={() => setSignMethod("certificate")}
                className={`flex-1 p-3 rounded-lg border-2 text-left transition text-sm ${
                  signMethod === "certificate" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="font-medium">📜 Certificate File</div>
                <div className="text-gray-500 text-xs mt-1">Upload .pfx/.p12 file</div>
              </button>
            </div>
          </div>

          {/* Digital Key section */}
          {signMethod === "key" && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <UsbKeyDetector
                onTokenDetected={(token, path) => {
                  setSelectedToken(token);
                  setModulePath(path);
                }}
                selectedToken={selectedToken}
              />
              {selectedToken && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
                  <input
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Enter your PIN"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          )}

          {/* Certificate section */}
          {signMethod === "certificate" && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">📜 Select Certificate</h3>
              {certificates.length === 0 ? (
                <p className="text-gray-500 text-sm">No certificates. <a href="/certificates" className="text-blue-600">Generate one →</a></p>
              ) : (
                <div className="space-y-2">
                  {certificates.map((cert) => (
                    <label
                      key={cert.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition text-sm ${
                        selectedCert === cert.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="cert"
                        checked={selectedCert === cert.id}
                        onChange={() => setSelectedCert(cert.id)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <div className="flex-1">
                        <p className="font-medium">{cert.name}</p>
                        <p className="text-xs text-gray-500">{cert.subject_cn} • {cert.key_algorithm}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {selectedCert && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Passphrase</label>
                  <input
                    type="password"
                    value={certPassphrase}
                    onChange={(e) => setCertPassphrase(e.target.value)}
                    placeholder="Enter certificate passphrase"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          )}

          {/* PDF Preview with draw-to-sign */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <PdfSigner
              file={pdfFile}
              onSign={handleSign}
              signing={signing}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
              ❌ {error}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Done */}
      {step === "done" && result && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-xl font-bold text-green-900 mb-2">Signed Successfully!</h3>
            <p className="text-green-700 mb-6 text-sm">Your PDF has been digitally signed.</p>
            <div className="flex gap-3 justify-center">
              <a                 href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}${result.download_url}`}
                className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition"
              >
                ⬇️ Download Signed PDF
              </a>
              <button
                onClick={() => {
                  setStep("upload");
                  setPdfFile(null);
                  setResult(null);
                  setError("");
                }}
                className="px-6 py-2 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
              >
                Sign Another
              </button>
            </div>
          </div>

          {/* Signature details */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h4 className="font-semibold text-gray-900 mb-2 text-sm">Details</h4>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-gray-500">Field</dt>
              <dd className="font-mono text-gray-900">{result.field_name}</dd>
              <dt className="text-gray-500">Signer</dt>
              <dd className="text-gray-900">{result.signer_name}</dd>
              <dt className="text-gray-500">Time</dt>
              <dd className="text-gray-900">{new Date(result.timestamp).toLocaleString()}</dd>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
