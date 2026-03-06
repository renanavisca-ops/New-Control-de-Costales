import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface ScannerProps {
  onScan: (code: string) => void;
  placeholder?: string;
}

const VALID_PREFIX = /^EMP02[0-9A-Z]+$/;

const Scanner: React.FC<ScannerProps> = ({
  onScan,
  placeholder = "Escanea código..."
}) => {
  const [manualCode, setManualCode] = useState("");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<Html5Qrcode | null>(null);

  const lastScanRef = useRef<string | null>(null);
  const lastScanTimeRef = useRef<number>(0);

  const confirmBuffer = useRef<string[]>([]);

  const SCAN_REGION_ID = "scan-region";

  const validateCode = (code: string) => {
    return VALID_PREFIX.test(code);
  };

  const confirmScan = (code: string) => {
    confirmBuffer.current.push(code);

    if (confirmBuffer.current.length > 3) {
      confirmBuffer.current.shift();
    }

    if (
      confirmBuffer.current.length === 3 &&
      confirmBuffer.current.every((c) => c === code)
    ) {
      confirmBuffer.current = [];
      return true;
    }

    return false;
  };

  const handleScan = (decodedText: string) => {
    const code = decodedText.trim().toUpperCase();

    if (!validateCode(code)) {
      return;
    }

    const now = Date.now();

    if (lastScanRef.current === code && now - lastScanTimeRef.current < 2000) {
      return;
    }

    if (!confirmScan(code)) {
      return;
    }

    lastScanRef.current = code;
    lastScanTimeRef.current = now;

    onScan(code);

    if (navigator.vibrate) navigator.vibrate(80);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim().toUpperCase();

    if (!validateCode(code)) {
      setError("Código inválido");
      return;
    }

    onScan(code);
    setManualCode("");
    inputRef.current?.focus();
  };

  const startCamera = async () => {
    setError(null);

    try {
      setIsCameraActive(true);
      await new Promise((r) => setTimeout(r, 100));

      if (!qrRef.current) {
        qrRef.current = new Html5Qrcode(SCAN_REGION_ID);
      }

      await qrRef.current.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: { width: 300, height: 200 },
          aspectRatio: 1.777
        },
        handleScan,
        () => {}
      );
    } catch (err) {
      console.error(err);
      setError("No se pudo iniciar la cámara.");
      setIsCameraActive(false);

      try {
        if (qrRef.current) {
          await qrRef.current.stop();
          await qrRef.current.clear();
        }
      } catch {}
    }
  };

  const stopCamera = async () => {
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
            className="flex-1 p-3 border-2 border-indigo-500 rounded-lg text-lg"
            autoFocus
          />
          <button
            type="submit"
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold"
          >
            OK
          </button>
        </form>

        <button
          onClick={() => (isCameraActive ? stopCamera() : startCamera())}
          className={`p-3 rounded-lg font-semibold ${
            isCameraActive
              ? "bg-red-100 text-red-600"
              : "bg-indigo-100 text-indigo-700"
          }`}
        >
          {isCameraActive ? "Cerrar Cámara" : "Usar Cámara"}
        </button>
      </div>

      <div
        className={`relative w-full bg-black rounded-xl overflow-hidden ${
          isCameraActive ? "" : "hidden"
        }`}
      >
        <div id={SCAN_REGION_ID} style={{ width: "100%" }} />
      </div>

      {error && <div className="text-red-500 text-sm">{error}</div>}
    </div>
  );
};

export default Scanner;
