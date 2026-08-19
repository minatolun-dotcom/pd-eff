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
  const [scannedModule, setScannedModule] = useState("");

  useEffect(() => {
    autoDetect();
  }, []);

  const autoDetect = async () => {
    setScanning(true);
    setError("");

    for (const mod of COMMON_MODULES) {
      for (const path of mod.paths) {
        try {
          const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
          const res = await fetch(`${apiBase}/api/pkcs11/tokens?module_path=${encodeURIComponent(path)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.tokens && data.tokens.length > 0) {
              setTokens(data.tokens);
              setModulePath(path);
              setScannedModule(mod.name);
              setScanning(false);
              onTokenDetected(data.tokens[0], path);
              return;
            }
          }
        } catch {
          // Module not available, try next
        }
      }
    }
    setScanning(false);
    setManualMode(true);
  };

  const handleManualScan = async () => {
    if (!modulePath) return;
    setScanning(true);
    setError("");
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiBase}/api/pkcs11/tokens?module_path=${encodeURIComponent(modulePath)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.tokens && data.tokens.length > 0) {
          setTokens(data.tokens);
          onTokenDetected(data.tokens[0], modulePath);
        } else {
          setError("No tokens found. Make sure your key is plugged in.");
        }
      } else {
        setError("Module not found. Check the path and try again.");
      }
    } catch {
      setError("Failed to connect to PKCS#11 module.");
    }
    setScanning(false);
  };

  const handleTokenSelect = (token: Pkcs11Token) => {
    onTokenDetected(token, modulePath);
  };

  // Scanning state
  if (scanning) {
    return (
      <div className="flex items-center gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-200 dark:border-blue-800/60">
        <div className="relative">
          <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center text-2xl animate-pulse">
            🔑
          </div>
          <div className="absolute inset-0 rounded-2xl border-2 border-blue-400 animate-ping opacity-30" />
        </div>
        <div>
          <p className="font-semibold text-blue-900 text-sm">Scanning for digital keys...</p>
          <p className="text-blue-600 text-xs mt-0.5">Checking common PKCS#11 modules</p>
        </div>
      </div>
    );
  }

  // Token detected
  if (selectedToken) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-200 dark:border-green-800/60 animate-scaleIn">
          <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center text-2xl">
            🔐
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-green-900 text-sm">{selectedToken.label}</p>
            <p className="text-green-600 text-xs">
              {selectedToken.model || "PKCS#11 Token"} · {scannedModule || "Hardware"}
            </p>
          </div>
          <span className="badge badge-success shrink-0">Connected</span>
        </div>

        {/* Other tokens */}
        {tokens.length > 1 && (
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">Other tokens available:</p>
            <div className="space-y-1.5">
              {tokens.filter((t) => t.slot_id !== selectedToken.slot_id).map((token) => (
                <button
                  key={token.slot_id}
                  onClick={() => handleTokenSelect(token)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-blue-50 dark:bg-blue-900/20/50 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm">
                    🔑
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{token.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{token.model}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Manual mode / not found
  return (
    <div className="space-y-3">
      {!manualMode ? (
        <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-2xl">
            🔑
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">No digital key detected</p>
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">Plug in your USB key and try again</p>
          </div>
          <button
            onClick={autoDetect}
            className="btn btn-outline btn-sm"
          >
            🔄 Rescan
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800/60">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-lg">
                ⚠️
              </div>
              <div>
                <p className="font-semibold text-amber-900 text-sm">No PKCS#11 modules found</p>
                <p className="text-amber-700 text-xs">Enter the module path manually</p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={modulePath}
                onChange={(e) => setModulePath(e.target.value)}
                placeholder="/path/to/pkcs11-module.so"
                className="input flex-1 text-xs font-mono"
              />
              <button
                onClick={handleManualScan}
                disabled={!modulePath}
                className="btn btn-primary btn-sm shrink-0"
              >
                Scan
              </button>
            </div>
            <button
              onClick={() => { setManualMode(false); autoDetect(); }}
              className="text-xs text-amber-700 hover:text-amber-900 mt-2 font-medium hover:underline"
            >
              ← Try auto-detect again
            </button>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-2xl p-3 text-red-700 text-sm flex items-start gap-2 animate-slideUp">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
