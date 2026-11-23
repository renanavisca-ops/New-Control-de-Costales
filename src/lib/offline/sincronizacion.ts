'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { almacen, aplicarLocal, type DatosOffline, type Operacion } from './almacen';

const VACIO: DatosOffline = { generado_at: '', categorias: [], costales: [], en_proceso: [] };

/** Mantiene los datos locales del celular y envía la cola de operaciones cuando hay internet. */
export function useSincronizacion(dispositivoId: string) {
  const sb = supabaseNavegador();
  const tienda = almacen(dispositivoId);
  const [datos, setDatos] = useState<DatosOffline>(VACIO);
  const [ops, setOps] = useState<Operacion[]>([]);
  const [enLinea, setEnLinea] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const procesando = useRef(false);

  const refrescarDatos = useCallback(async () => {
    const { data, error } = await sb.rpc('datos_offline');
    if (error || !data) return false;
    // Se vuelven a aplicar las operaciones aún pendientes sobre los datos del servidor
    let d = data as DatosOffline;
    const pendientes = tienda.operaciones().filter((o) => o.estado === 'PENDIENTE');
    pendientes.forEach((o) => (d = aplicarLocal(d, o, (o.datos.producto as string) ?? null)));
    tienda.guardarDatos(d);
    setDatos(d);
    return true;
  }, [sb]); // eslint-disable-line react-hooks/exhaustive-deps

  const procesarCola = useCallback(async () => {
    if (procesando.current || !navigator.onLine) return;
    procesando.current = true;
    setSincronizando(true);
    let huboCambios = false;
    try {
      for (;;) {
        const lista = tienda.operaciones();
        const op = lista.find((o) => o.estado === 'PENDIENTE');
        if (!op) break;
        const { data, error } = await sb.rpc('sincronizar_operacion', {
          p_id: op.id,
          p_tipo: op.tipo,
          p_token: op.token,
          p_datos: op.datos,
          p_ocurrido_at: op.ocurrido_at,
        });
        const r = data as { ok?: boolean; error?: string; resultado?: string; reintentar?: boolean } | null;
        if (error || !r || r.reintentar) break; // sin conexión o error temporal: se reintenta luego
        const actualizada = tienda.operaciones().map((o) =>
          o.id === op.id ? { ...o, estado: r.ok ? ('OK' as const) : ('ERROR' as const), error: r.error, resultado: r.resultado } : o,
        );
        tienda.guardarOperaciones(actualizada);
        setOps(tienda.operaciones());
        huboCambios = true;
      }
      if (huboCambios || !tienda.datos()) await refrescarDatos();
    } finally {
      procesando.current = false;
      setSincronizando(false);
    }
  }, [sb, refrescarDatos]); // eslint-disable-line react-hooks/exhaustive-deps

  const agregar = useCallback(
    (op: Operacion, nombreProducto: string | null) => {
      tienda.guardarOperaciones([...tienda.operaciones(), op]);
      const nuevos = aplicarLocal(tienda.datos() ?? VACIO, op, nombreProducto);
      tienda.guardarDatos(nuevos);
      setDatos(nuevos);
      setOps(tienda.operaciones());
      void procesarCola();
    },
    [procesarCola], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    setDatos(tienda.datos() ?? VACIO);
    setOps(tienda.operaciones());
    setEnLinea(navigator.onLine);
    void (navigator.onLine ? refrescarDatos().then(() => procesarCola()) : Promise.resolve());
    const alConectar = () => {
      setEnLinea(true);
      void procesarCola().then(() => refrescarDatos());
    };
    const alDesconectar = () => setEnLinea(false);
    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    const t = setInterval(() => {
      setEnLinea(navigator.onLine);
      if (navigator.onLine) void procesarCola();
    }, 15000);
    const t2 = setInterval(() => navigator.onLine && void refrescarDatos(), 60000);
    return () => {
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
      clearInterval(t);
      clearInterval(t2);
    };
  }, [dispositivoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendientes = ops.filter((o) => o.estado === 'PENDIENTE').length;
  const errores = ops.filter((o) => o.estado === 'ERROR');

  return { datos, ops, enLinea, sincronizando, pendientes, errores, agregar, procesarCola, refrescarDatos, tienda };
}
