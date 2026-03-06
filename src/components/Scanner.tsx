import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface ScannerProps {
  onScan: (code: string) => void;
  placeholder?: string;
}

const REQUIRED_PREFIX = "EMP02";
const DUPLICATE_BLOCK_MS = 2000;
const SCAN_REGION_ID = "scan-region";

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

  const normalizeCode = (raw: string): string => {
    let code = raw.trim().toUpperCase();
    code = code.replace(/[^A-Z0-9]/g, "");

    // Correcciones comunes del prefijo
    if (code.startsWith("EBP02")) {
      code = REQUIRED_PREFIX + code.slice(5);
    } else if (code.startsWith("EMPO2")) {
      code = REQUIRED_PREFIX + code.slice(5);
    } else if (code.startsWith("EMP0Z")) {
      code = REQUIRED_PREFIX + code.slice(5);
    } else if (code.startsWith("EP02")) {
      code = REQUIRED_PREFIX + code.slice(4);
    } else if (/^E.P02/.test(code)) {
      code = REQUIRED_PREFIX + code.slice(5);
    }

    return code;
  };

  const isValidBusinessCode = (code: string): boolean => {
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

    if (!isValidBusinessCode(normalized)) return;
    if (shouldBlockDuplicate(normalized)) return;

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

    if (!isValidBusinessCode(normalized)) {
      setError("Código inválido.");
      return;
    }

    setError(null);
    acceptCode(normalized);
    setManualCode("");
    inputRef.current?.focus();
  };

  const pickBestRearCameraId = async (): Promise<string | null> => {
    try {
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) return null;

      const ranked = [...cameras].sort((a, b) => {
        const score = (label: string) => {
          const l = label.toLowerCase();
          let s = 0;
          if (l.includes("back")) s += 100;
          if (l.includes("rear")) s += 100;
          if (l.includes("environment")) s += 100;
          if (l.includes("trase")) s += 100;
          if (l.includes("wide")) s += 20;
          if (l.includes("0.6")) s += 10;
          if (l.includes("front")) s -= 200;
          if (l.includes("user")) s -= 200;
          return s;
        };

        return score(b.label) - score(a.label);
      });

      return ranked[0]?.id ?? null;
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  const applyAndroidFriendlyVideoTweaks = async () => {
    if (!qrRef.current) return;

    try {
      const scanner: any = qrRef.current;

      const capabilities = scanner.getRunningTrackCapabilities?.();
      const constraints: any = {
        advanced: []
      };

      if (capabilities?.focusMode) {
        const focusModes = Array.isArray(capabilities.focusMode)
          ? capabilities.focusMode
          : [capabilities.focusMode];

        if (focusModes.includes("continuous")) {
          constraints.advanced.push({ focusMode: "continuous" });
        }
      }

      if (capabilities?.zoom) {
        const minZoom = capabilities.zoom.min ?? 1;
        const maxZoom = capabilities.zoom.max ?? 1;
        const idealZoom = Math.min(Math.max(2, minZoom), maxZoom);

        if (idealZoom >= minZoom && idealZoom <= maxZoom) {
          constraints.advanced.push({ zoom: idealZoom });
        }
      }

      if (capabilities?.torch) {
        // no la encendemos sola, pero dejamos esto aquí por si luego quieres botón
      }

      if (constraints.advanced.length > 0) {
        await scanner.applyVideoConstraints?.(constraints);
      }
    } catch (err) {
      console.error("No se pudieron aplicar ajustes avanzados de video:", err);
    }
  };

  const startCamera = async () => {
    setError(null);

    try {
      setIsCameraActive(true);
      await new Promise((r) => setTimeout(r, 60));

      if (!qrRef.current) {
        qrRef.current = new Html5Qrcode(SCAN_REGION_ID);
      }

      const rearCameraId = await pickBestRearCameraId();

      const cameraConfig = rearCameraId
        ? rearCameraId
        : { facingMode: "environment" };

      await qrRef.current.start(
        cameraConfig as any,
        {
          fps: 8,
          disableFlip: true,
          aspectRatio: 1.7777778,
          // MUY IMPORTANTE:
          // no usamos qrbox cuadrado porque perjudica CODE_128
          videoConstraints: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          } as MediaTrackConstraints
        } as any,
        (decodedText) => {
          acceptCode(decodedText);
        },
        () => {
          // ignorar errores por frame
        }
      );

      await applyAndroidFriendlyVideoTweaks();
    } catch (err) {
      console.error(err);
      setError("No se pudo iniciar la cámara. Verifica permisos en Chrome/Safari.");
      setIsCameraActive(false);

      try {
        if (qrRef.current) {
          const scanner: any = qrRef.current;
          if (scanner.isScanning) {
            await qrRef.current.stop();
          }
          await qrRef.current.clear();
        }
      } catch (_) {}
    }
  };

  const stopCamera = async () => {
    setError(null);

    try {
      if (qrRef.current) {
        const scanner: any = qrRef.current;
        if (scanner.isScanning) {
          await qrRef.current.stop();
        }
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
