import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface ScannerProps {
  onScan: (code: string) => void;
  placeholder?: string;
}

const Scanner: React.FC<ScannerProps> = ({ onScan, placeholder = "Escanea código..." }) => {
  const [manualCode, setManualCode] = useState("");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<Html5Qrcode | null>(null);

  // ID del contenedor donde html5-qrcode dibuja la cámara
  const SCAN_REGION_ID = "scan-region";

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    onScan(code);
    setManualCode("");
    inputRef.current?.focus();
  };

  const startCamera = async () => {
    setError(null);

    try {
      // 1) Activar UI primero para que el DIV exista en el DOM (CRÍTICO en iPhone)
      setIsCameraActive(true);
      await new Promise((r) => setTimeout(r, 50));

      // 2) Crear instancia si no existe
      if (!qrRef.current) {
        qrRef.current = new Html5Qrcode(SCAN_REGION_ID);
      }

      // 3) Iniciar cámara
      await qrRef.current.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText) => {
          // Callback al detectar
          onScan(decodedText);
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

      // Limpieza si falló
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

  // Limpieza al desmontar
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

      {/* IMPORTANTE: el DIV SIEMPRE existe; solo se oculta. iPhone lo necesita en el DOM */}
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
