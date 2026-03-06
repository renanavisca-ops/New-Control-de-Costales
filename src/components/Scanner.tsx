import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
  Html5QrcodeScannerState,
} from "html5-qrcode";

interface ScannerProps {
  onScan: (code: string) => void;
  placeholder?: string;
}

/**
 * Objetivo:
 * - Leer rápido (cámaras malas) sin pedir 3 "acercadas"
 * - Corregir lecturas comunes (EMP02 -> EBP02, E?P02, espacios/símbolos)
 * - Evitar dobles escaneos (TTL)
 *
 * Nota: tus códigos comienzan con EMP02.
 */
const REQUIRED_PREFIX = "EMP02";
const DEDUPE_TTL_MS = 1500;

// Ventana corta para "estabilidad" sin pedir re-escaneo manual
const STABILITY_WINDOW_MS = 650;
const MIN_HITS_FOR_STABILITY = 2;

const Scanner: React.FC<ScannerProps> = ({
  onScan,
  placeholder = "Escanea código...",
}) => {
  const [manualCode, setManualCode] = useState("");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<Html5Qrcode | null>(null);

  // Dedupe (evita doble captura del mismo código en corto tiempo)
  const lastAcceptedRef = useRef<{ code: string; at: number } | null>(null);

  // Buffer de lecturas recientes (para elegir la lectura más probable)
  const hitsRef = useRef<Array<{ raw: string; norm: string; at: number }>>([]);

  const SCAN_REGION_ID = "scan-region";

  const formatsToSupport = useMemo(
    () => [
      // 1D barcodes típicos
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.ITF,
      // Si también usas QR, déjalo:
      Html5QrcodeSupportedFormats.QR_CODE,
    ],
    []
  );

  function nowMs() {
    return Date.now();
  }

  /**
   * Normaliza el texto:
   * - uppercase
   * - elimina espacios y símbolos no alfanuméricos
   */
  function normalizeRaw(raw: string) {
    return raw
      .trim()
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, ""); // quita símbolos raros que generan "E♥P"
  }

  /**
   * Corrige lecturas frecuentes en el prefijo:
   * - EBP02... -> EMP02...
   * - EP02...  -> EMP02... (cuando "M" se pierde)
   * - E?P02... -> EMP02... (si el segundo char es confuso)
   *
   * Importante: solo aplicamos autocorrección al *prefijo*, no al resto.
   */
  function autocorrectPrefix(norm: string) {
    if (norm.startsWith(REQUIRED_PREFIX)) return norm;

    // Casos comunes: EBP02..., ERP02..., E8P02..., E-P02...
    // Si detectamos patrón E?P02..., forzamos a EMP02...
    const m = norm.match(/^E([0-9A-Z])P02(.*)$/);
    if (m) {
      const rest = m[2] ?? "";
      return `${REQUIRED_PREFIX}${rest}`;
    }

    // Caso: EP02... (se perdió la letra del medio)
    const m2 = norm.match(/^EP02(.*)$/);
    if (m2) {
      const rest = m2[1] ?? "";
      return `${REQUIRED_PREFIX}${rest}`;
    }

    // Caso: EBP02... específicamente
    if (norm.startsWith("EBP02")) {
      return REQUIRED_PREFIX + norm.slice("EBP02".length);
    }

    return norm;
  }

  /**
   * Valida:
   * - Debe iniciar con EMP02
   * - Debe tener un largo mínimo razonable (ajusta si lo necesitas)
   */
  function isValidBusinessCode(code: string) {
    if (!code.startsWith(REQUIRED_PREFIX)) return false;
    // Ajusta esto a tu realidad: si tus códigos tienen largo fijo, mejor.
    if (code.length < REQUIRED_PREFIX.length + 4) return false;
    return /^[0-9A-Z]+$/.test(code);
  }

  /**
   * Agrega hit a buffer y decide si ya aceptamos algo.
   * Regla:
   * - Ventana STABILITY_WINDOW_MS
   * - Si hay >= MIN_HITS_FOR_STABILITY del mismo código → aceptar
   * - Si solo hay 1 lectura pero es válida → aceptar inmediatamente
   *
   * Esto mejora muchísimo en cámaras malas: no pide 3 “acercadas”,
   * pero sí reduce errores cuando el detector fluctúa.
   */
  function decideAcceptance(candidateNorm: string) {
    const t = nowMs();

    // Limpia hits viejos
    hitsRef.current = hitsRef.current.filter((h) => t - h.at <= STABILITY_WINDOW_MS);

    // Cuenta ocurrencias por código normalizado
    const counts = new Map<string, number>();
    for (const h of hitsRef.current) {
      counts.set(h.norm, (counts.get(h.norm) ?? 0) + 1);
    }

    // Elige el más frecuente (modo)
    let bestCode = candidateNorm;
    let bestCount = counts.get(candidateNorm) ?? 0;

    for (const [code, count] of counts.entries()) {
      if (count > bestCount) {
        bestCode = code;
        bestCount = count;
      }
    }

    // Si el mejor tiene suficientes hits, aceptar
    if (bestCount >= MIN_HITS_FOR_STABILITY) {
      return bestCode;
    }

    // Si el candidato por sí mismo es válido, aceptar sin demorar
    // (prioriza velocidad/recall)
    if (isValidBusinessCode(candidateNorm)) {
      return candidateNorm;
    }

    return null;
  }

  function acceptIfNotDuplicate(code: string) {
    const t = nowMs();
    const last = lastAcceptedRef.current;
    if (last && last.code === code && t - last.at < DEDUPE_TTL_MS) return;

    lastAcceptedRef.current = { code, at: t };
    onScan(code);

    if (navigator.vibrate) navigator.vibrate(60);
  }

  const handleScan = (decodedText: string) => {
    // Normaliza y autocorrige
    const norm0 = normalizeRaw(decodedText);
    const norm = autocorrectPrefix(norm0);

    // Guardamos hit (aunque sea inválido) para estabilizar fluctuaciones
    const t = nowMs();
    hitsRef.current.push({ raw: decodedText, norm, at: t });

    // Decidir aceptación
    const accepted = decideAcceptance(norm);
    if (!accepted) return;

    // Validación final estricta
    if (!isValidBusinessCode(accepted)) return;

    acceptIfNotDuplicate(accepted);

    // Limpia buffer para que no “arrastre” hits al próximo código
    hitsRef.current = [];
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const norm0 = normalizeRaw(manualCode);
    const norm = autocorrectPrefix(norm0);

    if (!isValidBusinessCode(norm)) {
      setError("Código inválido (debe iniciar con EMP02).");
      return;
    }

    setError(null);
    acceptIfNotDuplicate(norm);
    setManualCode("");
    inputRef.current?.focus();
  };

  const startCamera = async () => {
    setError(null);

    try {
      setIsCameraActive(true);
      await new Promise((r) => setTimeout(r, 80));

      if (!qrRef.current) {
        qrRef.current = new Html5Qrcode(SCAN_REGION_ID);
      }

      // Si ya estaba activo, no re-iniciar
      const state = (qrRef.current as any).getState?.() as Html5QrcodeScannerState | undefined;
      if (state === Html5QrcodeScannerState.SCANNING) return;

      await qrRef.current.start(
        { facingMode: "environment" },
        {
          fps: 12, // Menos fps = más luz/exposición por frame en móviles baratos
          // qrbox más grande ayuda a 1D cuando el usuario no tiene pulso perfecto
          qrbox: { width: 360, height: 220 },
          aspectRatio: 1.777,
          disableFlip: true,
          formatsToSupport,
          experimentalFeatures: {
            // En Chrome/Edge modernos mejora MUCHO 1D si está disponible
            useBarCodeDetectorIfSupported: true,
          },
        },
        handleScan,
        () => {}
      );
    } catch (err) {
      console.error(err);
      setError("No se pudo iniciar la cámara (permisos o dispositivo).");
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
      if (qrRef.current && (qrRef.current as any).getState?.() === Html5QrcodeScannerState.SCANNING) {
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
            isCameraActive ? "bg-red-100 text-red-600" : "bg-indigo-100 text-indigo-700"
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
