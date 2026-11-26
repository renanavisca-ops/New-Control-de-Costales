'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { rpc } from '@/lib/datos';
import { tieneRol, type AsignacionRol, type Tienda } from '@/lib/tipos';
import { Aviso, Boton, Campo, Entrada, Insignia, Modal, Selector, Tarjeta, Titulo } from '@/components/ui';

type Linea = { id: string; piezas_enviadas: number; piezas_recibidas: number | null; categorias: { nombre: string } | null };
type Retorno = {
  id: string;
  codigo: string;
  tienda_id: string;
  destino_id: string;
  estado: 'EN_TRANSITO' | 'RECIBIDO' | 'CON_DIFERENCIA';
  enviado_at: string;
  piezas_enviadas: number;
  piezas_recibidas: number | null;
  peso_recibido: number | null;
  notas: string | null;
  recibido_at: string | null;
  retorno_lineas: Linea[];
};

const NOMBRE = { EN_TRANSITO: 'En tránsito', RECIBIDO: 'Recibido', CON_DIFERENCIA: 'Con diferencia' } as const;
const COLOR = { EN_TRANSITO: 'indigo', RECIBIDO: 'green', CON_DIFERENCIA: 'red' } as const;

export default function RetornosCliente({ roles, destinoId }: { roles: AsignacionRol[]; destinoId?: string }) {
  const sb = supabaseNavegador();
  const [retornos, setRetornos] = useState<Retorno[]>([]);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [estado, setEstado] = useState('EN_TRANSITO');
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<Retorno | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [peso, setPeso] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    let q = sb
      .from('retornos')
      .select('id, codigo, tienda_id, destino_id, estado, enviado_at, piezas_enviadas, piezas_recibidas, peso_recibido, notas, recibido_at, retorno_lineas(id, piezas_enviadas, piezas_recibidas, categorias(nombre))')
      .order('enviado_at', { ascending: false })
      .limit(500);
    if (estado) q = q.eq('estado', estado);
    if (destinoId) q = q.eq('destino_id', destinoId);
    const [r, t] = await Promise.all([q, sb.from('tiendas').select('*')]);
    setRetornos((r.data as unknown as Retorno[]) || []);
    setTiendas((t.data as Tienda[]) || []);
  }, [estado, destinoId, sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const tienda = (id: string) => tiendas.find((t) => t.id === id);
  const puedeRecibir = (r: Retorno) => {
    const destino = tienda(r.destino_id);
    return !!destino && tieneRol(roles, destino.organizacion_id, ['ADMIN_ORG', 'BODEGA']);
  };

  const abrir = (r: Retorno) => {
    setAbierto(r);
    setCantidades(Object.fromEntries(r.retorno_lineas.map((l) => [l.id, String(l.piezas_recibidas ?? l.piezas_enviadas)])));
    setPeso('');
    setNotas('');
    setError('');
  };

  const recibir = async () => {
    if (!abierto) return;
    const lineas = abierto.retorno_lineas.map((l) => ({ id: l.id, piezas: Number(cantidades[l.id] || 0) }));
    const res = await rpc('recibir_retorno', { p_id: abierto.id, p_lineas: lineas, p_peso: peso ? Number(peso) : null, p_notas: notas });
    if (res.error) return setError(res.error);
    setAbierto(null);
    cargar();
  };

  const visibles = retornos.filter((r) => r.codigo.includes(busqueda.toUpperCase()));

  return (
    <div>
      <Titulo>Retornos de saldo</Titulo>
      <p className="mb-4 text-sm text-gray-500">
        Saldo que las tiendas devuelven al centro de distribución. Cada saco lleva escrito su código (SAL-…). Al llegar, búscalo aquí, cuenta las piezas y confírmalo.
      </p>
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Selector value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos</option>
          <option value="EN_TRANSITO">En tránsito</option>
          <option value="RECIBIDO">Recibidos</option>
          <option value="CON_DIFERENCIA">Con diferencia</option>
        </Selector>
        <Entrada placeholder="Buscar código (ej. SAL-B105-AB12)" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {visibles.length === 0 && <p className="text-sm text-gray-400">Sin retornos.</p>}
        {visibles.map((r) => (
          <Tarjeta key={r.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-mono font-black">{r.codigo}</p>
              <p className="text-xs text-gray-500">
                {tienda(r.tienda_id)?.codigo ?? ''} → {tienda(r.destino_id)?.codigo ?? ''} · {new Date(r.enviado_at).toLocaleString()} ·{' '}
                {r.retorno_lineas.map((l) => `${l.categorias?.nombre ?? '?'} ${l.piezas_enviadas}`).join(', ')}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Insignia color={COLOR[r.estado]}>{NOMBRE[r.estado]}</Insignia>
              <p className="text-xs font-bold">
                {r.piezas_enviadas} pzs{r.piezas_recibidas !== null ? ` → ${r.piezas_recibidas}` : ''}
              </p>
              <Boton variante="suave" className="px-3 py-1 text-xs" onClick={() => abrir(r)}>
                {r.estado === 'EN_TRANSITO' && puedeRecibir(r) ? 'Recibir' : 'Ver'}
              </Boton>
            </div>
          </Tarjeta>
        ))}
      </div>

      {abierto && (
        <Modal titulo={abierto.codigo} onCerrar={() => setAbierto(null)}>
          <p className="text-sm text-gray-500">
            De {tienda(abierto.tienda_id)?.nombre ?? ''} · enviado {new Date(abierto.enviado_at).toLocaleString()}
          </p>
          <div className="space-y-2">
            {abierto.retorno_lineas.map((l) => (
              <div key={l.id} className="grid grid-cols-5 items-center gap-2 text-sm">
                <span className="col-span-2 font-bold">{l.categorias?.nombre ?? '?'}</span>
                <span className="text-gray-500">Envió {l.piezas_enviadas}</span>
                {abierto.estado === 'EN_TRANSITO' && puedeRecibir(abierto) ? (
                  <Entrada
                    className="col-span-2"
                    inputMode="numeric"
                    value={cantidades[l.id] ?? ''}
                    onChange={(e) => setCantidades({ ...cantidades, [l.id]: e.target.value.replace(/\D/g, '') })}
                  />
                ) : (
                  <span className={`col-span-2 font-black ${l.piezas_recibidas !== null && l.piezas_recibidas !== l.piezas_enviadas ? 'text-red-600' : ''}`}>
                    {l.piezas_recibidas !== null ? `Recibió ${l.piezas_recibidas}` : 'Pendiente'}
                  </span>
                )}
              </div>
            ))}
          </div>
          {abierto.estado === 'EN_TRANSITO' && puedeRecibir(abierto) ? (
            <>
              <Campo etiqueta="Peso recibido (lb, opcional)">
                <Entrada inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value.replace(/[^0-9.]/g, ''))} />
              </Campo>
              <Campo etiqueta="Notas">
                <Entrada value={notas} onChange={(e) => setNotas(e.target.value)} />
              </Campo>
              {error && <Aviso tipo="error">{error}</Aviso>}
              <Boton className="w-full" onClick={recibir}>Confirmar recepción</Boton>
            </>
          ) : (
            <p className="text-sm text-gray-500">
              {abierto.recibido_at ? `Recibido ${new Date(abierto.recibido_at).toLocaleString()}` : 'Aún no se recibe en el centro.'}
              {abierto.peso_recibido ? ` · ${abierto.peso_recibido} lb` : ''}
              {abierto.notas ? ` · ${abierto.notas}` : ''}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
