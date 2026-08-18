"use client";

import { useState, useEffect } from "react";

interface Pkcs11Token {
  slot_id: number;
  label: string;
  serial_number: string;
  model: string;
  manufacturer: string;
  keys: Array<{
    label: string;
    type: string;
    id: string;
    can_sign?: boolean;
  }>;
}

interface UsbKeyDetectorProps {
  onTokenDetected: (token: Pkcs11Token, modulePath: string) => void;
  selectedToken: Pkcs11Token | null;
}

// Common PKCS#11 module paths to auto-detect
const COMMON_MODULES = [
  { name: "OpenSC", paths: ["/usr/lib/pkcs11/libopensc.so", "/usr/lib/x86_64-linux-gnu/pkcs11/opensc-pkcs11.so"] },
  { name: "SoftHSM", paths: ["/usr/lib/softhsm/libsofthsm2.so", "/usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so"] },
  { name: "YubiKey", paths: ["/usr/lib/x86_64-linux-gnu/pkcs11/libykcs11.so"] },
  { name: "OpenSC (macOS)", paths: ["/usr/lib/opensc-pkcs11.so", "/opt/homebrew/lib/pkcs11/opensc-pkcs11.so"] },
  { name: "OpenSC (Windows)", paths: ["C:\\Windows\\System32\\opensc-pkcs11.dll"] },
];

export default function UsbKeyDetector({ onTokenDetected, selectedToken }: UsbKeyDetectorProps) {
  const [modulePath, setModulePath] = useState("");
  const [tokens, setTokens] = useState<Pkcs11Token[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [manualMode, setManualMode] = useState(false);

  // Auto-detect on mount
  useEffect(() => {
    autoDetect();
  }, []);

  const autoDetect = async () => {
    setScanning(true);
    setError("");

    for (const mod of COMMON_MODULES) {
      for (const path of mod.paths) {
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
          const res = await fetch(`${apiUrl}/api/pkcs11/tokens?module_path=${encodeURIComponent(path)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.tokens && data.tokens.length > 0) {
              setTokens(data.tokens);
              setModulePath(path);
              // Auto-select first token
              onTokenDetected(data.tokens[0], path);
              setScanning(false);
              return;
            }
          }
        } catch {
          // Module not found, continue
        }
      }
    }
    setScanning(false);
  };

  const handleManualScan = async () => {
    if (!modulePath) return;
    setScanning(true);
    setError("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/pkcs11/tokens?module_path=${encodeURIComponent(modulePath)}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.detail || "Failed to scan");
        setScanning(false);
        return;
      }
      const data = await res.json();
      if (data.tokens && data.tokens.length > 0) {
        setTokens(data.tokens);
        onTokenDetected(data.tokens[0], modulePath);
      } else {
        setError("No tokens found. Make sure your digital key is plugged in.");
      }
    } catch (err: any) {
      setError(err.message || "Scan failed");
    }
    setScanning(false);
  };

  return (
    <div className="space-y-4">
      {/* Auto-detect status */}
      <div className={`rounded-xl border p-4 ${
        selectedToken
          ? "bg-green-50 border-green-200"
          : scanning
          ? "bg-yellow-50 border-yellow-200"
          : "bg-gray-50 border-gray-200"
      }`}>
        <div className="flex items-center gap-3">
          {scanning ? (
            <div className="animate-spin text-2xl">🔑</div>
          ) : selectedToken ? (
            <div className="text-2xl">✅</div>
          ) : (
            <div className="text-2xl">🔌</div>
          )}
          <div className="flex-1">
            <p className="font-medium text-gray-900">
              {scanning
                ? "Scanning for digital keys..."
                : selectedToken
                ? "Digital key detected!"
                : "No digital key detected"}
            </p>
            {selectedToken && (
              <div className="text-sm text-gray-600 mt-1">
                <p>Device: {selectedToken.manufacturer} {selectedToken.model}</p>
                <p>Token: {selectedToken.label}</p>
                <p>Serial: {selectedToken.serial_number}</p>
                {selectedToken.keys.length > 0 && (
                  <p className="mt-1">
                    Keys: {selectedToken.keys.map(k => (
                      <span key={k.id} className="inline-block px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs mr-1">
                        {k.label || k.type}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            )}
          </div>
          {!selectedToken && !scanning && (
            <button
              onClick={autoDetect}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              🔄 Scan again
            </button>
          )}
        </div>
      </div>

      {/* Manual mode toggle */}
      {!selectedToken && !scanning && (
        <div>
          <button
            onClick={() => setManualMode(!manualMode)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {manualMode ? "← Hide manual setup" : "🔧 Enter PKCS#11 module path manually"}
          </button>

          {manualMode && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PKCS#11 Module Path
                </label>
                <input
                  type="text"
                  value={modulePath}
                  onChange={(e) => setModulePath(e.target.value)}
                  placeholder="e.g. /usr/lib/pkcs11/libopensc.so"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleManualScan}
                disabled={!modulePath || scanning}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
              >
                {scanning ? "Scanning..." : "🔍 Scan for tokens"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Token selection (if multiple) */}
      {tokens.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select token:
          </label>
          <div className="space-y-2">
            {tokens.map((token) => (
              <label
                key={token.slot_id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                  selectedToken?.slot_id === token.slot_id
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="token"
                  checked={selectedToken?.slot_id === token.slot_id}
                  onChange={() => onTokenDetected(token, modulePath)}
                  className="w-4 h-4 text-blue-600"
                />
                <div>
                  <p className="font-medium text-gray-900">{token.label}</p>
                  <p className="text-sm text-gray-500">
                    {token.manufacturer} • {token.serial_number}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ❌ {error}
        </div>
      )}

      {/* Instructions */}
      {!selectedToken && !scanning && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <p className="font-medium mb-1">How to use a digital key:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Plug in your USB digital key (YubiKey, smart card, etc.)</li>
            <li>Click &quot;Scan again&quot; above</li>
            <li>Select your token when detected</li>
            <li>Draw a rectangle on the PDF where you want the signature</li>
            <li>Click &quot;Sign here&quot; and enter your PIN when prompted</li>
          </ol>
        </div>
      )}
    </div>
  );
}
