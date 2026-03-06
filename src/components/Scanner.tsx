import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface ScannerProps {
  onScan: (code: string) => void;
  placeholder?: string;
}

const REQUIRED_PREFIX = "EMP02";
const DUPLICATE_BLOCK_MS = 2000;

const Scanner: React.FC<ScannerProps> = ({
  onScan,
  placeholder = "Escanea código..."
}) => {
  const [manualCode, setManualCode] = useState("");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<Html5Qrcode | null>(null);

  const lastAcceptedCodeRef = useRef<string>("");
  const lastAcceptedTimeRef = useRef<number>(0);

  const SCAN_REGION_ID = "scan-region";

  const normalizeCode = (raw: string): string => {
    let code = raw.trim().toUpperCase();

    // Quitar espacios y símbolos raros que a veces mete la cámara
    code = code.replace(/[^A-Z0-9]/g, "");

    // Correcciones comunes solo al prefijo
    if (code.startsWith("EBP02")) {
      code = REQUIRED_PREFIX + code.slice(5);
    } else if (/^E.P02/.test(code)) {
      code = REQUIRED_PREFIX + code.slice(5);
    } else if (code.startsWith("EP02")) {
      code = REQUIRED_PREFIX + code.slice(4);
    }

    return code;
  };

  const isProbablyValidBusinessCode = (code: string): boolean => {
    if (!code.startsWith(REQUIRED_PREFIX)) return false;
    if (code.length <= REQUIRED_PREFIX.length) return false;
    return /^[A-Z0-9]+$/.test(code);
  };

  const shouldBlockDuplicate = (code: string): boolean => {
    const now = Date.now();
    return (
      lastAcceptedCodeRef.current === code &&
      now - lastAcceptedTimeRef.current < DUPLICATE_BLOCK_MS
    );
  };

  const acceptCode = (raw: string) => {
    const normalized = normalizeCode(raw);

    if (!isProbablyValidBusinessCode(normalized)) {
      return;
    }

    if (shouldBlockDuplicate(normalized)) {
      return;
    }

    lastAcceptedCodeRef.current = normalized;
    lastAcceptedTimeRef.current = Date.now();

    onScan(normalized);

    if (navigator.vibrate) {
      navigator.vibrate(80);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeCode(manualCode);

    if (!normalized) return;

    if (!isProbablyValidBusinessCode(normalized)) {
      setError("Código inválido.");
      return;
    }

    setError(null);
    acceptCode(normalized);
    setManualCode("");
    inputRef.current?.focus();
  };

  const startCamera = async () => {
    setError(null);

    try {
      // Mantener la lógica original porque esa sí te funcionaba en Apple y Android
      setIsCameraActive(true);
      await new Promise((r) => setTimeout(r, 50));

      if (!qrRef.current) {
        qrRef.current = new Html5Qrcode(SCAN_REGION_ID);
      }

      await qrRef.current.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText) => {
          acceptCode(decodedText);
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
      <div className="flex flex-col gap-2">
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

        <button
          onClick={() => (isCameraActive ? stopCamera() : startCamera())}
          className={`flex items-center justify-center gap-2 p-3 rounded-lg font-semibold transition-colors ${
            isCameraActive ? "bg-red-100 text-red-600" : "bg-indigo-100 text-indigo-700"
          }`}
        >
          {isCameraActive ? "Cerrar Cámara" : "Usar Cámara"}
        </button>
      </div>

      <div
        className={`relative w-full bg-black rounded-xl overflow-hidden shadow-inner ${
          isCameraActive ? "" : "hidden"
        }`}
      >
        <div id={SCAN_REGION_ID} className="w-full" />
      </div>

      {error && <p className="text-xs text-red-500 italic">{error}</p>}
    </div>
  );
};

export default Scanner;
