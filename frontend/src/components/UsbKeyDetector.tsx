"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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
  onClearSelection?: () => void;
}

const COMMON_MODULES = [
  { name: "OpenSC", paths: ["/usr/lib/pkcs11/libopensc.so", "/usr/lib/x86_64-linux-gnu/pkcs11/opensc-pkcs11.so"] },
  { name: "SoftHSM", paths: ["/usr/lib/softhsm/libsofthsm2.so", "/usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so"] },
  { name: "YubiKey", paths: ["/usr/lib/x86_64-linux-gnu/pkcs11/libykcs11.so"] },
  { name: "OpenSC (macOS)", paths: ["/usr/lib/opensc-pkcs11.so", "/opt/homebrew/lib/pkcs11/opensc-pkcs11.so"] },
  { name: "OpenSC (Windows)", paths: ["C:\\Windows\\System32\\opensc-pkcs11.dll"] },
];

// ─── localStorage helpers ────────────────────────────────────────
const STORAGE_KEY_MODULE = "pd-eff-pkcs11-module";
const STORAGE_KEY_TOKEN = "pd-eff-pkcs11-token";
const POLL_INTERVAL_MS = 5000; // Check for USB key every 5 seconds

function saveModulePath(path: string) {
  try { localStorage.setItem(STORAGE_KEY_MODULE, path); } catch {}
}
function loadModulePath(): string {
  try { return localStorage.getItem(STORAGE_KEY_MODULE) || ""; } catch { return ""; }
}
function saveCachedToken(token: Pkcs11Token, modulePath: string, moduleName: string) {
  try {
    localStorage.setItem(STORAGE_KEY_TOKEN, JSON.stringify({
      label: token.label,
      serial_number: token.serial_number,
      model: token.model,
      manufacturer: token.manufacturer,
      modulePath,
      moduleName,
      cachedAt: Date.now(),
    }));
  } catch {}
}
function loadCachedToken(): { label: string; serial_number: string; model: string; modulePath: string; moduleName: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TOKEN);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Cache expires after 30 days
    if (Date.now() - (data.cachedAt || 0) > 30 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      return null;
    }
    return data;
  } catch { return null; }
}
function clearCachedToken() {
  try { localStorage.removeItem(STORAGE_KEY_TOKEN); } catch {}
}

// ─── PIN session cache (sessionStorage — clears on browser close) ─
const STORAGE_KEY_PIN = "pd-eff-pin";

export function saveSessionPin(pin: string) {
  try { sessionStorage.setItem(STORAGE_KEY_PIN, btoa(pin)); } catch {}
}
export function loadSessionPin(): string {
  try { return atob(sessionStorage.getItem(STORAGE_KEY_PIN) || ""); } catch { return ""; }
}
export function clearSessionPin() {
  try { sessionStorage.removeItem(STORAGE_KEY_PIN); } catch {}
}

// ─── Scan a single module path for tokens ────────────────────────
async function scanModule(path: string): Promise<Pkcs11Token[]> {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const res = await fetch(`${apiBase}/api/pkcs11/tokens?module_path=${encodeURIComponent(path)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.tokens || [];
  } catch {
    return [];
  }
}

export default function UsbKeyDetector({ onTokenDetected, selectedToken, onClearSelection }: UsbKeyDetectorProps) {
  const [modulePath, setModulePath] = useState("");
  const [tokens, setTokens] = useState<Pkcs11Token[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [scannedModule, setScannedModule] = useState("");
  const [lastScanTime, setLastScanTime] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // ── Initial detection: try cached module path first, then auto-detect ──
  useEffect(() => {
    mountedRef.current = true;
    detectWithCache();
    return () => { mountedRef.current = false; };
  }, []);

  const detectWithCache = useCallback(async () => {
    // 1. Try the cached module path first (instant recognition)
    const cachedPath = loadModulePath();
    if (cachedPath) {
      const tokens = await scanModule(cachedPath);
      if (tokens.length > 0 && mountedRef.current) {
        const cached = loadCachedToken();
        // Match by serial number if available
        const match = cached
          ? tokens.find(t => t.serial_number === cached.serial_number) || tokens[0]
          : tokens[0];
        const moduleName = cached?.moduleName || "Hardware";
        setTokens(tokens);
        setModulePath(cachedPath);
        setScannedModule(moduleName);
        saveModulePath(cachedPath);
        saveCachedToken(match, cachedPath, moduleName);
        onTokenDetected(match, cachedPath);
        return;
      }
    }

    // 2. Fall back to full auto-detect
    await autoDetect(false);
  }, [onTokenDetected]);

  // ── Auto-detect polling: when no token is selected, periodically check ──
  useEffect(() => {
    if (selectedToken) {
      // Stop polling when token is connected
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }

    // Start polling when no token
    pollRef.current = setInterval(async () => {
      if (!mountedRef.current || scanning) return;
      const cachedPath = loadModulePath();
      const pathToCheck = cachedPath || "";
      if (!pathToCheck) return;

      const tokens = await scanModule(pathToCheck);
      if (tokens.length > 0 && mountedRef.current) {
        const cached = loadCachedToken();
        const match = cached
          ? tokens.find(t => t.serial_number === cached.serial_number) || tokens[0]
          : tokens[0];
        setTokens(tokens);
        setModulePath(pathToCheck);
        setScannedModule(cached?.moduleName || "Hardware");
        saveCachedToken(match, pathToCheck, cached?.moduleName || "Hardware");
        onTokenDetected(match, pathToCheck);
      }
    }, POLL_INTERVAL_MS);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selectedToken, scanning, onTokenDetected]);

  const autoDetect = async (showScanning = true) => {
    if (showScanning) setScanning(true);
    setError("");

    for (const mod of COMMON_MODULES) {
      for (const path of mod.paths) {
        const tokens = await scanModule(path);
        if (tokens.length > 0 && mountedRef.current) {
          setTokens(tokens);
          setModulePath(path);
          setScannedModule(mod.name);
          setLastScanTime(Date.now());
          saveModulePath(path);
          saveCachedToken(tokens[0], path, mod.name);
          setScanning(false);
          onTokenDetected(tokens[0], path);
          return;
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
    const tokens = await scanModule(modulePath);
    if (tokens.length > 0) {
      setTokens(tokens);
      setLastScanTime(Date.now());
      saveModulePath(modulePath);
      saveCachedToken(tokens[0], modulePath, "Manual");
      setScannedModule("Manual");
      onTokenDetected(tokens[0], modulePath);
    } else {
      setError("No tokens found. Make sure your key is plugged in.");
    }
    setScanning(false);
  };

  const handleTokenSelect = (token: Pkcs11Token) => {
    saveCachedToken(token, modulePath, scannedModule);
    onTokenDetected(token, modulePath);
  };

  const handleDisconnect = () => {
    clearCachedToken();
    clearSessionPin();
    setTokens([]);
    onClearSelection?.();
  };

  // ── Scanning state ──
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
          <p className="text-blue-600 text-xs mt-0.5">
            {modulePath ? `Checking ${scannedModule || "cached module"}` : "Checking common PKCS#11 modules"}
          </p>
        </div>
      </div>
    );
  }

  // ── Token detected ──
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
              {selectedToken.serial_number && ` · SN: ${selectedToken.serial_number.slice(0, 12)}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="badge badge-success">Connected</span>
            <button
              onClick={handleDisconnect}
              className="text-[10px] text-gray-400 hover:text-red-500 transition-colors p-1"
              title="Disconnect and clear cached key"
            >
              ✕
            </button>
          </div>
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

        {/* Previously cached info */}
        {loadCachedToken() && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
            Key info cached for faster detection next time
          </p>
        )}
      </div>
    );
  }

  // ── Not found / manual mode ──
  return (
    <div className="space-y-3">
      {!manualMode ? (
        <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-2xl">
            🔑
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">No digital key detected</p>
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
              {modulePath
                ? "Key may have been unplugged. Plug it in to auto-detect."
                : "Plug in your USB key — we'll auto-detect it"}
            </p>
          </div>
          <button onClick={() => autoDetect()} className="btn btn-outline btn-sm">
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
