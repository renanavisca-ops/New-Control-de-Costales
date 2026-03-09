import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface ScannerProps {
  onScan: (code: string) => void;
  placeholder?: string;
  allowManualEntry?: boolean;
  codePattern?: RegExp;
  invalidMessage?: string;
  normalizeScan?: (code: string) => string;
}

const Scanner: React.FC<ScannerProps> = ({
  onScan,
  placeholder = "Escanea código...",
  allowManualEntry = true,
  codePattern,
  invalidMessage = 'Código inválido.',
  normalizeScan
}) => {
  const [manualCode, setManualCode] = useState("");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<string>('');

  const SCAN_REGION_ID = "scan-region";

  const normalizeValue = (value: string) => {
    const clean = normalizeScan ? normalizeScan(value) : value.trim();
    return clean.trim();
  };

  const submitCode = (rawValue: string) => {
    const code = normalizeValue(rawValue);
    if (!code) return;
    if (codePattern && !codePattern.test(code)) {
      setError(invalidMessage);
      return;
    }
    setError(null);
    if (lastScannedRef.current === code) return;
    lastScannedRef.current = code;
    window.setTimeout(() => {
      if (lastScannedRef.current === code) lastScannedRef.current = '';
    }, 1200);
    onScan(code);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCode(manualCode);
    setManualCode("");
    inputRef.current?.focus();
  };

  const startCamera = async () => {
    setError(null);

    try {
      setIsCameraActive(true);
      await new Promise((r) => setTimeout(r, 50));

      if (!qrRef.current) {
        qrRef.current = new Html5Qrcode(SCAN_REGION_ID);
      }

      await qrRef.current.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 220, height: 120 }
        },
        (decodedText) => {
          submitCode(decodedText);
          if (navigator.vibrate) navigator.vibrate(100);
        },
        () => {
          // Ignorar errores por frame
        }
      );
    } catch (err) {
      console.error(err);
      setError("No se pudo iniciar la cámara. Verifica permisos en Safari/Chrome.");
      setIsCameraActive(false);

      try {
        if (qrRef.current) {
          await qrRef.current.stop();
          await qrRef.current.clear();
        }
      } catch (_) {}
    }
  };

  const stopCamera = async () => {
    setError(null);
    try {
      if (qrRef.current && qrRef.current.isScanning) {
        await qrRef.current.stop();
      }
      if (qrRef.current) {
        await qrRef.current.clear();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsCameraActive(false);
    }
  };

  useEffect(() => {
    return () => {
      stopCamera().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full space-y-4">
      <div
        className={`mx-auto w-full max-w-xs bg-black rounded-xl overflow-hidden shadow-inner ${
          isCameraActive ? "block" : "hidden"
        }`}
      >
        <div id={SCAN_REGION_ID} className="w-full" />
      </div>

      <div className="flex flex-col gap-2">
        {allowManualEntry ? (
          <form onSubmit={handleManualSubmit} className="relative flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder={placeholder}
              className="flex-1 p-3 border-2 border-indigo-500 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              autoFocus
            />
            <button
              type="submit"
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 active:scale-95 transition-all"
            >
              OK
            </button>
          </form>
        ) : (
          <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700">
            Recepción y apertura únicamente por lectura de código de barras.
          </div>
        )}

        <button
          onClick={() => (isCameraActive ? stopCamera() : startCamera())}
          className={`flex items-center justify-center gap-2 p-3 rounded-lg font-semibold transition-colors ${
            isCameraActive ? "bg-red-100 text-red-600" : "bg-indigo-100 text-indigo-700"
          }`}
        >
          {isCameraActive ? "Cerrar Cámara" : "Usar Cámara"}
        </button>
      </div>

      {error && <p className="text-xs text-red-500 italic">{error}</p>}
    </div>
  );
};

export default Scanner;

