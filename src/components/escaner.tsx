'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Escáner de códigos con 4 métodos:
 *  - Cámara en vivo: se analiza la franja central de cada cuadro EN LA RESOLUCIÓN REAL de la cámara
 *    (html5-qrcode por sí solo reduce la imagen al tamaño del recuadro en pantalla y los códigos
 *    de barras largos de las etiquetas quedan ilegibles). Usa el lector nativo de Android si existe; si no, ZXing.
 *    Un código se acepta cuando la cámara lo lee igual 2 veces y tiene el formato de la etiqueta.
 *  - Foto: una foto fija con autoenfoque, analizada completa (lo más confiable con cámaras sencillas).
 *  - Lector USB o Bluetooth en modo teclado: escribe en el campo y envía Enter.
 *  - Escritura manual en el mismo campo.
 */
const LECTURAS_IGUALES = 2;
const VENTANA_MS = 4000;
const PAUSA_TRAS_LECTURA_MS = 1800;
const INTERVALO_MS = 120; // pausa entre análisis de cuadros
const ANCHO_ANALISIS = 1280; // la franja se analiza a este ancho máximo (≈7 px por barra en una etiqueta EMP)

/** Formato de los códigos del sistema: etiquetas EMP + 8 dígitos y sacos de saldo SAL-… */
export function codigoValido(codigo: string) {
  if (codigo.startsWith('EMP')) return /^EMP\d{8}$/.test(codigo);
  return codigo.length >= 4;
}
/** La cámara es más estricta: solo acepta códigos con el formato exacto, para descartar lecturas basura. */
const codigoCamaraValido = (c: string) => /^EMP\d{8}$/.test(c) || /^SAL-[A-Z0-9]+-[A-Z0-9]{4}$/.test(c);

// Tipos de código de barras que puede traer una etiqueta (los más comunes en impresoras de etiquetas)
const FORMATOS = (F: typeof import('html5-qrcode').Html5QrcodeSupportedFormats) => [
  F.CODE_128, F.CODE_39, F.CODE_93, F.CODABAR, F.ITF, F.EAN_13, F.EAN_8, F.UPC_A, F.QR_CODE,
];

type Decodificador = { decodeAsync: (c: HTMLCanvasElement) => Promise<{ text: string }> };

/** Decodificador de html5-qrcode (nativo si existe, si no ZXing) con lectura exhaustiva activada. */
async function crearDecodificador(): Promise<Decodificador> {
  const [{ Html5QrcodeSupportedFormats: F }, { Html5QrcodeShim }] = await Promise.all([
    import('html5-qrcode'),
    import('html5-qrcode/esm/code-decoder'),
  ]);
  const silencioso = { log() {}, warn() {}, logError() {}, logErrors() {} };
  const shim = new Html5QrcodeShim(FORMATOS(F), true, false, silencioso) as unknown as Decodificador & {
    primaryDecoder?: { hints?: Map<unknown, unknown> };
    secondaryDecoder?: { hints?: Map<unknown, unknown> };
  };
  // TRY_HARDER (clave 3 en ZXing): más lento pero lee códigos de barras inclinados o con poco contraste
  [shim.primaryDecoder, shim.secondaryDecoder].forEach((d) => d?.hints?.set(3, true));
  return shim;
}

/** Reduce una foto grande (12–50 MP) a un ancho máximo para que la lectura sea rápida. */
async function reducir(archivo: File, ancho: number): Promise<File> {
  try {
    const img = await createImageBitmap(archivo);
    const escala = Math.min(1, ancho / Math.max(img.width, img.height));
    if (escala === 1) return archivo;
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * escala);
    c.height = Math.round(img.height * escala);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.92));
    return blob ? new File([blob], 'foto.jpg', { type: 'image/jpeg' }) : archivo;
  } catch {
    return archivo;
  }
}

type Capacidades = MediaTrackCapabilities & { torch?: boolean; zoom?: { min: number; max: number; step: number } };

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
  const [leyendoFoto, setLeyendoFoto] = useState(false);
  const entradaRef = useRef<HTMLInputElement>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activoRef = useRef(false);
  const ultimoRef = useRef<{ codigo: string; t: number }>({ codigo: '', t: 0 });
  const votosRef = useRef<{ codigo: string; t: number }[]>([]);
  const pausaRef = useRef(0);
  const onCodigoRef = useRef(onCodigo);
  onCodigoRef.current = onCodigo;
  const deshabilitadoRef = useRef(deshabilitado);
  deshabilitadoRef.current = deshabilitado;

  const limpiar = (bruto: string) => bruto.toUpperCase().replace(/[^A-Z0-9-]/g, '');

  const emitir = useCallback((codigo: string) => {
    if (codigo.length < 4) return;
    const ahora = Date.now();
    if (ultimoRef.current.codigo === codigo && ahora - ultimoRef.current.t < 2500) return; // evita lecturas dobles
    ultimoRef.current = { codigo, t: ahora };
    if (navigator.vibrate) navigator.vibrate(80);
    onCodigoRef.current(codigo);
  }, []);

  const mostrarLeido = (codigo: string, ms: number) => {
    setLeido(codigo);
    setTimeout(() => setLeido((l) => (l === codigo ? null : l)), ms);
  };

  /** Lectura de cámara: se acepta solo cuando el mismo código válido aparece varias veces. */
  const alLeerCamara = useCallback(
    (bruto: string) => {
      const ahora = Date.now();
      if (deshabilitadoRef.current || ahora < pausaRef.current) return;
      const codigo = limpiar(bruto);
      if (!codigoCamaraValido(codigo)) {
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
      setProgreso(0);
      mostrarLeido(codigo, PAUSA_TRAS_LECTURA_MS + 1500);
      emitir(codigo);
    },
    [emitir],
  );

  const detenerCamara = useCallback(async () => {
    activoRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamara(false);
    setLinterna(null);
    setZoom(null);
    setProgreso(0);
    setAvisoFormato('');
  }, []);

  /** Bucle: recorta la franja central del cuadro en resolución real y la analiza. */
  const bucle = async (decodificador: Decodificador) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    while (activoRef.current) {
      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.videoWidth) {
        // Franja horizontal: 92% del ancho y 40% del alto del cuadro, al centro (donde está la guía en pantalla)
        const sw = Math.round(v.videoWidth * 0.92);
        const sh = Math.round(v.videoHeight * 0.4);
        const sx = Math.round((v.videoWidth - sw) / 2);
        const sy = Math.round((v.videoHeight - sh) / 2);
        const escala = Math.min(1, ANCHO_ANALISIS / sw);
        canvas.width = Math.round(sw * escala);
        canvas.height = Math.round(sh * escala);
        ctx.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        try {
          const r = await decodificador.decodeAsync(canvas);
          if (r?.text) alLeerCamara(r.text);
        } catch {
          /* sin código en este cuadro */
        }
      }
      await new Promise((r) => setTimeout(r, INTERVALO_MS));
    }
  };

  const iniciarCamara = async () => {
    setErrorCamara('');
    setAvisoFormato('');
    try {
      const [decodificador, stream] = await Promise.all([
        crearDecodificador(),
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        }),
      ]);
      streamRef.current = stream;
      setCamara(true);
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play().catch(() => undefined);
      const pista = stream.getVideoTracks()[0];
      // Enfoque continuo, linterna y zoom si el celular los permite
      try {
        await pista.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] });
      } catch {
        /* sin enfoque continuo */
      }
      const cap = (pista.getCapabilities?.() ?? {}) as Capacidades;
      if (cap.torch) setLinterna(false);
      if (cap.zoom && cap.zoom.max > cap.zoom.min) {
        const ajustes = pista.getSettings() as MediaTrackSettings & { zoom?: number };
        setZoom({ min: cap.zoom.min, max: Math.min(cap.zoom.max, 5), step: cap.zoom.step || 0.1, valor: ajustes.zoom ?? cap.zoom.min });
      }
      activoRef.current = true;
      void bucle(decodificador);
    } catch {
      setErrorCamara('No se pudo abrir la cámara. Revisa los permisos de la app o usa 📸 Foto.');
      await detenerCamara();
    }
  };

  const cambiarLinterna = async () => {
    const pista = streamRef.current?.getVideoTracks()[0];
    try {
      const nuevo = !linterna;
      await pista?.applyConstraints({ advanced: [{ torch: nuevo } as MediaTrackConstraintSet] });
      setLinterna(nuevo);
    } catch {
      setLinterna(null);
    }
  };

  const cambiarZoom = async (valor: number) => {
    setZoom((z) => (z ? { ...z, valor } : z));
    try {
      await streamRef.current?.getVideoTracks()[0]?.applyConstraints({ advanced: [{ zoom: valor } as MediaTrackConstraintSet] });
    } catch {
      /* ignorar */
    }
  };

  /** Foto con autoenfoque: más nítida que el video en cámaras sencillas. Una sola lectura basta (es una foto fija). */
  const leerFoto = async (archivo: File | undefined) => {
    if (!archivo) return;
    setLeyendoFoto(true);
    setAvisoFormato('');
    if (camara) await detenerCamara();
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import('html5-qrcode');
      const lector = new Html5Qrcode('region-foto', { verbose: false, formatsToSupport: FORMATOS(F) });
      // Se prueba la foto reducida (rápida) y, si no se encuentra, en tamaño mayor
      let textoFoto = '';
      for (const ancho of [1600, 2600]) {
        try {
          const r = await lector.scanFileV2(await reducir(archivo, ancho), false);
          textoFoto = r.decodedText;
          break;
        } catch {
          /* probar otro tamaño */
        }
      }
      lector.clear();
      if (!textoFoto) throw new Error('sin código');
      const codigo = limpiar(textoFoto);
      if (!codigoValido(codigo)) setAvisoFormato(`La foto dio "${codigo}", que no parece un código de costal. Toma otra foto más de cerca.`);
      else {
        mostrarLeido(codigo, 3000);
        emitir(codigo);
      }
    } catch {
      setAvisoFormato('No se encontró un código en la foto. Acércate a 15–20 cm, con el código derecho y sin reflejos, y vuelve a intentar.');
    } finally {
      setLeyendoFoto(false);
      if (fotoRef.current) fotoRef.current.value = '';
    }
  };

  useEffect(() => () => void detenerCamara(), [detenerCamara]);

  useEffect(() => {
    if (!deshabilitado && !camara) entradaRef.current?.focus();
  }, [deshabilitado, camara]);

  return (
    <div className="space-y-3">
      <div className={`relative overflow-hidden rounded-2xl bg-black ${camara ? 'block' : 'hidden'}`}>
        <video ref={videoRef} playsInline muted autoPlay className="block w-full" />
        {/* Guía: la misma franja que se analiza */}
        <div className="pointer-events-none absolute inset-x-[4%] top-[30%] h-[40%] rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
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
          Pon el código de barras dentro del recuadro, derecho y a unos 15–25 cm, con buena luz. Si no lo lee, usa 📸 Foto.
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
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={deshabilitado}
          onClick={() => (camara ? detenerCamara() : iniciarCamara())}
          className={`rounded-2xl p-3 text-sm font-bold ${camara ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-700'}`}
        >
          {camara ? 'Cerrar cámara' : '📷 Usar cámara'}
        </button>
        <button
          type="button"
          disabled={deshabilitado || leyendoFoto}
          onClick={() => fotoRef.current?.click()}
          className="rounded-2xl bg-indigo-50 p-3 text-sm font-bold text-indigo-700 disabled:opacity-50"
        >
          {leyendoFoto ? 'Leyendo foto…' : '📸 Foto'}
        </button>
      </div>
      <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => leerFoto(e.target.files?.[0])} />
      <div id="region-foto" className="hidden" />
      {!camara && leido && (
        <div className="rounded-2xl bg-green-600 p-3 text-center text-white">
          <p className="text-[11px] font-bold uppercase">Leído · compáralo con la etiqueta</p>
          <p className="font-mono text-2xl font-black tracking-wider">{leido}</p>
        </div>
      )}
      {errorCamara && <p className="text-xs font-semibold text-red-600">{errorCamara}</p>}
    </div>
  );
}
