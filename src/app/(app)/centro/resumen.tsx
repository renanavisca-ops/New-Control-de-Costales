'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseNavegador } from '@/lib/supabase/client';
import { Aviso, Tarjeta, Titulo } from '@/components/ui';

type Resumen = {
  existencia: { producto: string; costales: number; piezas: number }[];
  contenedores: number;
  enviados_30d: { traslados: number; costales: number; piezas: number };
  tiendas: number;
  organizaciones: number;
  retornos_en_camino: number;
  por_revisar: number;
  inventario_abierto: string | null;
};
const n = (x: number) => Number(x).toLocaleString();

export default function ResumenCentro({ centro }: { centro: { id: string; codigo: string; nombre: string } }) {
  const [r, setR] = useState<Resumen | null>(null);
  useEffect(() => {
    supabaseNavegador()
      .rpc('centro_resumen', { p_centro: centro.id })
      .then(({ data }: { data: unknown }) => setR(data as Resumen));
  }, [centro.id]);

  const totC = r?.existencia.reduce((s, x) => s + x.costales, 0) ?? 0;
  const totP = r?.existencia.reduce((s, x) => s + x.piezas, 0) ?? 0;

  return (
    <div>
      <Titulo>
        {centro.codigo} · {centro.nombre}
      </Titulo>
      <p className="mb-5 text-sm text-gray-500">Plataforma del centro de distribución: existencias, contenedores, traslados a todas las organizaciones que abastece, retornos e inventario.</p>
      {r && r.por_revisar > 0 && (
        <div className="mb-4">
          <Aviso tipo="error">
            ⚠ {r.por_revisar} traslado{r.por_revisar > 1 ? 's tienen' : ' tiene'} costales que no estaban en la existencia del centro.{' '}
            <Link href="/centro/traslados" className="font-black underline">Revisar</Link>
          </Aviso>
        </div>
      )}
      {r?.inventario_abierto && (
        <div className="mb-4">
          <Aviso tipo="info">
            Hay un inventario del centro abierto. <Link href="/centro/inventario" className="font-black underline">Continuar escaneando</Link>
          </Aviso>
        </div>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Cifra e="Costales en el centro" v={n(totC)} c="bg-emerald-50 text-emerald-700" />
        <Cifra e="Piezas en el centro" v={n(totP)} c="bg-emerald-50 text-emerald-700" />
        <Cifra e="Contenedores con existencia" v={n(r?.contenedores ?? 0)} c="bg-blue-50 text-blue-700" />
        <Cifra e="Enviado últimos 30 días" v={`${n(r?.enviados_30d.costales ?? 0)} costales`} c="bg-indigo-50 text-indigo-700" />
        <Cifra e="Tiendas que abastece" v={`${n(r?.tiendas ?? 0)} · ${n(r?.organizaciones ?? 0)} org.`} c="bg-purple-50 text-purple-700" />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Tarjeta className="xl:col-span-2">
          <p className="mb-3 text-xs font-black uppercase tracking-wide text-gray-400">Existencia del centro por producto</p>
          {r && r.existencia.length === 0 && <p className="text-sm text-gray-400">Sin existencia. Cárgala en Existencias y traslados.</p>}
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {r?.existencia.map((x) => (
              <div key={x.producto} className="flex justify-between border-b border-gray-100 py-2 text-sm">
                <span className="font-bold">{x.producto}</span>
                <span className="font-mono text-gray-600">
                  {n(x.costales)} costales · {n(x.piezas)} pzs
                </span>
              </div>
            ))}
          </div>
        </Tarjeta>
        <Tarjeta className="space-y-2">
          <p className="text-xs font-black uppercase tracking-wide text-gray-400">Accesos rápidos</p>
          {[
            ['/centro/traslados', '📦 Cargar existencias o un traslado'],
            ['/centro/tiendas', '🏬 Ver qué tiene cada tienda'],
            ['/centro/retornos', `↩️ Retornos de saldo (${r?.retornos_en_camino ?? 0} en camino)`],
            ['/centro/inventario', '🔍 Inventario del centro'],
          ].map(([h, t]) => (
            <Link key={h} href={h} className="block rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold hover:bg-emerald-50">
              {t}
            </Link>
          ))}
        </Tarjeta>
      </div>
    </div>
  );
}

function Cifra({ e, v, c }: { e: string; v: string; c: string }) {
  return (
    <div className={`rounded-3xl p-4 ${c}`}>
      <p className="text-[10px] font-black uppercase tracking-wide opacity-80">{e}</p>
      <p className="mt-1 text-2xl font-black">{v}</p>
    </div>
  );
}
