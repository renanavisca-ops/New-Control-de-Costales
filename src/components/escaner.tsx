'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Escáner de códigos con 3 métodos:
 *  - Cámara del celular (html5-qrcode, códigos de barras 1D y QR).
 *  - Lector USB o Bluetooth en modo teclado: escribe en el campo y envía Enter.
 *  - Escritura manual en el mismo campo.
 */
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
  const entradaRef = useRef<HTMLInputElement>(null);
  const lectorRef = useRef<{ stop: () => Promise<void>; clear: () => void; isScanning: boolean } | null>(null);
  const ultimoRef = useRef<{ codigo: string; t: number }>({ codigo: '', t: 0 });
  const idRegion = 'region-escaner';

  const emitir = useCallback(
    (bruto: string) => {
      const codigo = bruto.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      if (codigo.length < 4) return;
      const ahora = Date.now();
      if (ultimoRef.current.codigo === codigo && ahora - ultimoRef.current.t < 2500) return; // evita lecturas dobles
      ultimoRef.current = { codigo, t: ahora };
      if (navigator.vibrate) navigator.vibrate(80);
      onCodigo(codigo);
    },
    [onCodigo],
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
  }, []);

  const iniciarCamara = async () => {
    setErrorCamara('');
    setCamara(true);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      await new Promise((r) => setTimeout(r, 50));
      const lector = new Html5Qrcode(idRegion);
      lectorRef.current = lector as unknown as typeof lectorRef.current;
      await lector.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 120 } },
        (decodificado) => emitir(decodificado),
        () => undefined,
      );
    } catch {
      setErrorCamara('No se pudo abrir la cámara. Revisa los permisos del navegador.');
      await detenerCamara();
    }
  };

  useEffect(() => () => void detenerCamara(), [detenerCamara]);

  useEffect(() => {
    if (!deshabilitado && !camara) entradaRef.current?.focus();
  }, [deshabilitado, camara]);

  return (
    <div className="space-y-3">
      <div className={`overflow-hidden rounded-2xl bg-black ${camara ? 'block' : 'hidden'}`}>
        <div id={idRegion} className="w-full" />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          emitir(texto);
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
