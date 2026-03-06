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
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<Html5Qrcode | null>(null);

  const lastAcceptedCodeRef = useRef<string>("");
  const lastAcceptedTimeRef = useRef<number>(0);

  const SCAN_REGION_ID = "scan-region";

  const normalizeCode = (raw: string): string => {
    let code = raw.trim().toUpperCase();

    // Eliminar espacios y símbolos raros
    code = code.replace(/[^A-Z0-9]/g, "");

    // Correcciones comunes del prefijo
    if (code.startsWith("EBP02")) {
      code = REQUIRED_PREFIX + code.slice(5);
    } else if (code.startsWith("EMPO2")) {
      code = "EMP02" + code.slice(5);
    } else if (code.startsWith("EMP0Z")) {
      code = "EMP02" + code.slice(5);
    } else if (code.startsWith("EP02")) {
      code = REQUIRED_PREFIX + code.slice(4);
    } else if (/^E.P02/.test(code)) {
      code = REQUIRED_PREFIX + code.slice(5);
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

  const ensureScannerInstance = async () => {
    if (!qrRef.current) {
      qrRef.current = new Html5Qrcode(SCAN_REGION_ID);
    }
    return qrRef.current;
  };

  const startCamera = async () => {
    setError(null);

    try {
      setIsCameraActive(true);
      await new Promise((r) => setTimeout(r, 80));

      const scanner = await ensureScannerInstance();

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          // Caja horizontal para favorecer códigos 1D como CODE_128
          qrbox: { width: 320, height: 120 }
        },
        (decodedText) => {
          acceptCode(decodedText);
        },
        () => {
          // ignorar errores de frame
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
      if (qrRef.current && (qrRef.current as any).isScanning) {
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

  const handlePickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsProcessingImage(true);

    try {
      if (qrRef.current && (qrRef.current as any).isScanning) {
        await stopCamera();
      }

      const scanner = await ensureScannerInstance();

      const result = await (scanner as any).scanFile(file, false);
      acceptCode(result);
    } catch (err) {
      console.error(err);
      setError("No se pudo leer el código desde la foto.");
    } finally {
      setIsProcessingImage(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={() => (isCameraActive ? stopCamera() : startCamera())}
            disabled={isProcessingImage}
            className={`flex items-center justify-center gap-2 p-3 rounded-lg font-semibold transition-colors disabled:opacity-50 ${
              isCameraActive ? "bg-red-100 text-red-600" : "bg-indigo-100 text-indigo-700"
            }`}
          >
            {isCameraActive ? "Cerrar Cámara" : "Usar Cámara"}
          </button>

          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={isProcessingImage}
            className="flex items-center justify-center gap-2 p-3 rounded-lg font-semibold bg-emerald-100 text-emerald-700 transition-colors disabled:opacity-50"
          >
            {isProcessingImage ? "Procesando foto..." : "Tomar / Subir Foto"}
          </button>
        </div>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePickImage}
          className="hidden"
        />
      </div>

      <div
        className={`relative w-full bg-black rounded-xl overflow-hidden shadow-inner ${
          isCameraActive ? "" : "hidden"
        }`}
      >
        <div id={SCAN_REGION_ID} className="w-full" />
      </div>

      <div className="text-xs text-gray-500">
        En Android, si el video no enfoca bien, usa <strong>Tomar / Subir Foto</strong>.
      </div>

      {error && <p className="text-xs text-red-500 italic">{error}</p>}
    </div>
  );
};

export default Scanner;
