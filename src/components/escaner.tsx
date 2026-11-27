'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Escáner de códigos con 3 métodos:
 *  - Cámara del celular: usa el lector nativo de Android (BarcodeDetector) cuando existe y, si no, ZXing.
 *    Para evitar lecturas equivocadas con cámaras sencillas, un código solo se acepta cuando la cámara
 *    lo lee igual varias veces seguidas y tiene el formato de las etiquetas (EMP + 8 dígitos).
 *  - Lector USB o Bluetooth en modo teclado: escribe en el campo y envía Enter.
 *  - Escritura manual en el mismo campo.
 */
const LECTURAS_IGUALES = 2; // veces que la cámara debe leer el mismo código
const VENTANA_MS = 4000;
const PAUSA_TRAS_LECTURA_MS = 1800;

/** Formato de las etiquetas del sistema; otros códigos (p. ej. SAL-…) se aceptan si no empiezan con EMP. */
export function codigoValido(codigo: string) {
  if (codigo.startsWith('EMP')) return /^EMP\d{8}$/.test(codigo);
  return codigo.length >= 4;
}

type Lector = {
  stop: () => Promise<void>;
  clear: () => void;
  isScanning: boolean;
  getRunningTrackCameraCapabilities: () => {
    torchFeature: () => { isSupported: () => boolean; apply: (v: boolean) => Promise<void> };
    zoomFeature: () => { isSupported: () => boolean; min: () => number; max: () => number; step: () => number; value: () => number; apply: (v: number) => Promise<void> };
  };
  applyVideoConstraints: (c: MediaTrackConstraints) => Promise<void>;
};

export default function Escaner({
  onCodigo,
  deshabilitado = false,
  textoAyuda = 'Escanea con la cámara o con el lector',
}: {
  onCodigo: (codigo: string) => void;
  deshabilitado?: boolean;
  textoAyuda?: string;
}) {
  const [texto, setTexto] = useState('');
  const [camara, setCamara] = useState(false);
  const [errorCamara, setErrorCamara] = useState('');
  const [leido, setLeido] = useState<string | null>(null);
  const [progreso, setProgreso] = useState(0);
  const [linterna, setLinterna] = useState<boolean | null>(null); // null = no disponible
  const [zoom, setZoom] = useState<{ min: number; max: number; step: number; valor: number } | null>(null);
  const [avisoFormato, setAvisoFormato] = useState('');
  const entradaRef = useRef<HTMLInputElement>(null);
  const lectorRef = useRef<Lector | null>(null);
  const ultimoRef = useRef<{ codigo: string; t: number }>({ codigo: '', t: 0 });
  const votosRef = useRef<{ codigo: string; t: number }[]>([]);
  const pausaRef = useRef(0);
  const onCodigoRef = useRef(onCodigo);
  onCodigoRef.current = onCodigo;
  const deshabilitadoRef = useRef(deshabilitado);
  deshabilitadoRef.current = deshabilitado;
  const idRegion = 'region-escaner';

  const limpiar = (bruto: string) => bruto.toUpperCase().replace(/[^A-Z0-9-]/g, '');

  const emitir = useCallback((codigo: string) => {
    if (codigo.length < 4) return;
    const ahora = Date.now();
    if (ultimoRef.current.codigo === codigo && ahora - ultimoRef.current.t < 2500) return; // evita lecturas dobles
    ultimoRef.current = { codigo, t: ahora };
    if (navigator.vibrate) navigator.vibrate(80);
    onCodigoRef.current(codigo);
  }, []);

  /** Lectura de cámara: se acepta solo cuando el mismo código válido aparece varias veces. */
  const alLeerCamara = useCallback(
    (bruto: string) => {
      const ahora = Date.now();
      if (deshabilitadoRef.current || ahora < pausaRef.current) return;
      const codigo = limpiar(bruto);
      if (!codigoValido(codigo)) {
        setAvisoFormato(`Lectura dudosa (${codigo}). Acerca el celular y mantenlo quieto.`);
        return;
      }
      setAvisoFormato('');
      votosRef.current = votosRef.current.filter((v) => ahora - v.t < VENTANA_MS);
      votosRef.current.push({ codigo, t: ahora });
      const iguales = votosRef.current.filter((v) => v.codigo === codigo).length;
      setProgreso(Math.min(iguales, LECTURAS_IGUALES));
      if (iguales < LECTURAS_IGUALES) return;
      votosRef.current = [];
      pausaRef.current = ahora + PAUSA_TRAS_LECTURA_MS;
      setLeido(codigo);
      setProgreso(0);
      setTimeout(() => setLeido((l) => (l === codigo ? null : l)), PAUSA_TRAS_LECTURA_MS + 1500);
      emitir(codigo);
    },
    [emitir],
  );

  const detenerCamara = useCallback(async () => {
    try {
      if (lectorRef.current?.isScanning) await lectorRef.current.stop();
      lectorRef.current?.clear();
    } catch {
      /* ya detenida */
    }
    lectorRef.current = null;
    setCamara(false);
    setLinterna(null);
    setZoom(null);
    setProgreso(0);
    setAvisoFormato('');
  }, []);

  const iniciarCamara = async () => {
    setErrorCamara('');
    setCamara(true);
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import('html5-qrcode');
      await new Promise((r) => setTimeout(r, 50));
      const lector = new Html5Qrcode(idRegion, {
        verbose: false,
        formatsToSupport: [F.CODE_128, F.CODE_39, F.EAN_13, F.QR_CODE],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });
      lectorRef.current = lector as unknown as Lector;
      await lector.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          // franja ancha y baja: los códigos de barras de las etiquetas son alargados
          qrbox: (w: number, h: number) => ({ width: Math.max(200, Math.floor(w * 0.9)), height: Math.max(80, Math.floor(Math.min(h, w) * 0.4)) }),
          videoConstraints: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        (decodificado) => alLeerCamara(decodificado),
        () => undefined,
      );
      // enfoque continuo, linterna y zoom si el celular los permite
      try {
        await lectorRef.current?.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] });
      } catch {
        /* sin enfoque continuo */
      }
      try {
        const cap = lectorRef.current?.getRunningTrackCameraCapabilities();
        if (cap?.torchFeature().isSupported()) setLinterna(false);
        const z = cap?.zoomFeature();
        if (z?.isSupported()) {
          const inicial = Math.min(z.max(), Math.max(z.min(), 1.5));
          await z.apply(inicial);
          setZoom({ min: z.min(), max: Math.min(z.max(), 5), step: z.step() || 0.1, valor: inicial });
        }
      } catch {
        /* sin controles extra */
      }
    } catch {
      setErrorCamara('No se pudo abrir la cámara. Revisa los permisos del navegador.');
      await detenerCamara();
    }
  };

  const cambiarLinterna = async () => {
    try {
      const nuevo = !linterna;
      await lectorRef.current?.getRunningTrackCameraCapabilities().torchFeature().apply(nuevo);
      setLinterna(nuevo);
    } catch {
      setLinterna(null);
    }
  };

  const cambiarZoom = async (v: number) => {
    setZoom((z) => (z ? { ...z, valor: v } : z));
    try {
      await lectorRef.current?.getRunningTrackCameraCapabilities().zoomFeature().apply(v);
    } catch {
      /* ignorar */
    }
  };

  useEffect(() => () => void detenerCamara(), [detenerCamara]);

  useEffect(() => {
    if (!deshabilitado && !camara) entradaRef.current?.focus();
  }, [deshabilitado, camara]);

  return (
    <div className="space-y-3">
      <div className={`relative overflow-hidden rounded-2xl bg-black ${camara ? 'block' : 'hidden'}`}>
        <div id={idRegion} className="w-full" />
        {leido && (
          <div className="absolute inset-x-0 bottom-0 bg-green-600/95 p-3 text-center text-white">
            <p className="text-[11px] font-bold uppercase">Leído · compáralo con la etiqueta</p>
            <p className="font-mono text-2xl font-black tracking-wider">{leido}</p>
          </div>
        )}
        {!leido && progreso > 0 && (
          <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-center text-xs font-bold text-white">
            Leyendo… mantén quieto ({progreso}/{LECTURAS_IGUALES})
          </div>
        )}
      </div>
      {camara && (linterna !== null || zoom) && (
        <div className="flex items-center gap-3">
          {linterna !== null && (
            <button type="button" onClick={cambiarLinterna} className={`rounded-2xl px-3 py-2 text-sm font-bold ${linterna ? 'bg-yellow-300 text-yellow-900' : 'bg-gray-100 text-gray-700'}`}>
              🔦 {linterna ? 'Apagar luz' : 'Luz'}
            </button>
          )}
          {zoom && (
            <label className="flex flex-1 items-center gap-2 text-xs font-bold text-gray-600">
              Zoom
              <input type="range" min={zoom.min} max={zoom.max} step={zoom.step} value={zoom.valor} onChange={(e) => cambiarZoom(Number(e.target.value))} className="flex-1" />
            </label>
          )}
        </div>
      )}
      {avisoFormato && <p className="text-xs font-semibold text-orange-600">{avisoFormato}</p>}
      {camara && (
        <p className="text-[11px] text-gray-500">
          Pon el código de barras dentro del recuadro, a unos 15–25 cm, con buena luz. Si es una foto en otra pantalla, sube el brillo de esa pantalla.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const codigo = limpiar(texto);
          if (!codigoValido(codigo)) {
            setAvisoFormato(`"${codigo}" no parece un código de costal (EMP + 8 números). Revísalo.`);
            return;
          }
          setAvisoFormato('');
          emitir(codigo);
          setTexto('');
        }}
        className="flex gap-2"
      >
        <input
          ref={entradaRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={deshabilitado}
          placeholder={textoAyuda}
          autoCapitalize="characters"
          autoComplete="off"
          className="w-full rounded-2xl border-2 border-indigo-200 bg-white p-3 font-mono text-lg font-bold uppercase outline-none focus:border-indigo-500"
        />
        <button type="submit" disabled={deshabilitado} className="rounded-2xl bg-indigo-600 px-4 font-bold text-white disabled:opacity-50">
          OK
        </button>
      </form>
      <button
        type="button"
        disabled={deshabilitado}
        onClick={() => (camara ? detenerCamara() : iniciarCamara())}
        className={`w-full rounded-2xl p-3 text-sm font-bold ${camara ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-700'}`}
      >
        {camara ? 'Cerrar cámara' : '📷 Usar cámara'}
      </button>
      {errorCamara && <p className="text-xs font-semibold text-red-600">{errorCamara}</p>}
    </div>
  );
}
